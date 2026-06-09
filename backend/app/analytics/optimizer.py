from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)

try:
    import gurobipy as gp
    from gurobipy import GRB as _GRB

    _GUROBI_AVAILABLE = True
except Exception:  # noqa: BLE001
    _GUROBI_AVAILABLE = False


@dataclass
class FrontierPoint:
    expected_return: float
    expected_volatility: float
    sharpe_ratio: float
    weights: dict[str, float]


@dataclass
class OptimizationResult:
    optimal_weights: dict[str, float]
    expected_return: float
    expected_volatility: float
    sharpe_ratio: float
    frontier_points: list[FrontierPoint] = field(default_factory=list)
    solver: str = "unknown"
    solver_status: str = "Optimal"


def _bounds(n: int, allow_short: bool, min_weight: float, max_weight: float) -> list[tuple[float, float]]:
    lb = -max_weight if allow_short else max(0.0, min_weight)
    ub = max_weight
    return [(lb, ub)] * n


def _portfolio_stats(weights: np.ndarray, mu: np.ndarray, sigma: np.ndarray, rf: float) -> tuple[float, float, float]:
    ret = float(mu @ weights)
    vol = float(np.sqrt(np.clip(weights @ sigma @ weights, 0.0, None)))
    sharpe = (ret - rf) / vol if vol > 1e-12 else 0.0
    return ret, vol, sharpe


def _solve_min_var_gurobi(
    mu: np.ndarray,
    sigma: np.ndarray,
    bounds: list[tuple[float, float]],
    target_return: float | None = None,
) -> tuple[np.ndarray | None, bool]:
    try:
        env = gp.Env(empty=True)
        env.setParam("OutputFlag", 0)
        env.setParam("LogToConsole", 0)
        env.start()
        model = gp.Model(env=env)
        n = len(mu)
        lb = np.array([b[0] for b in bounds])
        ub = np.array([b[1] for b in bounds])
        w = model.addMVar(n, lb=lb, ub=ub, name="w")
        model.addConstr(w.sum() == 1.0, name="budget")
        if target_return is not None:
            model.addConstr(mu @ w == target_return, name="ret_target")
        model.setObjective(w @ sigma @ w, _GRB.MINIMIZE)
        model.optimize()
        if model.Status == _GRB.OPTIMAL:
            return np.array(w.X), True
        return None, False
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gurobi solve failed: %s", exc)
        return None, False


def _solve_min_var_scipy(
    mu: np.ndarray,
    sigma: np.ndarray,
    bounds: list[tuple[float, float]],
    target_return: float | None = None,
) -> tuple[np.ndarray | None, bool]:
    from scipy.optimize import minimize  # lazy import

    n = len(mu)
    x0 = np.ones(n) / n
    cons: list[dict] = [{"type": "eq", "fun": lambda w: float(w.sum()) - 1.0}]
    if target_return is not None:
        tr = float(target_return)
        cons.append({"type": "eq", "fun": lambda w, t=tr: float(mu @ w) - t})
    result = minimize(
        lambda w: float(w @ sigma @ w),
        x0,
        method="SLSQP",
        bounds=bounds,
        constraints=cons,
        options={"maxiter": 2000, "ftol": 1e-10},
    )
    if result.success:
        return result.x, True
    # retry with perturbed x0
    x0 = np.random.default_rng(42).dirichlet(np.ones(n))
    result = minimize(
        lambda w: float(w @ sigma @ w),
        x0,
        method="SLSQP",
        bounds=bounds,
        constraints=cons,
        options={"maxiter": 2000, "ftol": 1e-10},
    )
    if result.success:
        return result.x, True
    return None, False


def _solve_qp(
    mu: np.ndarray,
    sigma: np.ndarray,
    bounds: list[tuple[float, float]],
    target_return: float | None = None,
    use_gurobi: bool = True,
) -> tuple[np.ndarray | None, str]:
    if use_gurobi and _GUROBI_AVAILABLE:
        w, ok = _solve_min_var_gurobi(mu, sigma, bounds, target_return)
        if ok:
            return w, "Gurobi"
        logger.info("Gurobi solve failed or infeasible, falling back to scipy")

    w, ok = _solve_min_var_scipy(mu, sigma, bounds, target_return)
    if ok:
        return w, "scipy"
    return None, "failed"


def _return_range(
    mu: np.ndarray,
    sigma: np.ndarray,
    bounds: list[tuple[float, float]],
) -> tuple[float, float]:
    """Min-variance return (lower bound) and max achievable return (upper bound)."""
    w_min, solver = _solve_qp(mu, sigma, bounds, target_return=None)
    if w_min is None:
        r_min = float(mu.min())
    else:
        r_min = float(mu @ w_min)

    # Max return: feasible upper bound is max single-asset return subject to budget+bounds
    n = len(mu)
    lb = np.array([b[0] for b in bounds])
    ub = np.array([b[1] for b in bounds])
    # greedy: fill into highest-return asset up to ub, rest at lb (if budget constraint allows)
    sorted_idx = np.argsort(mu)[::-1]
    w_max = lb.copy()
    budget_left = 1.0 - lb.sum()
    for idx in sorted_idx:
        alloc = min(ub[idx] - lb[idx], budget_left)
        w_max[idx] += alloc
        budget_left -= alloc
        if budget_left <= 1e-10:
            break
    r_max = float(mu @ w_max)
    return r_min, r_max


def optimize_portfolio(
    expected_returns: np.ndarray,
    cov_matrix: np.ndarray,
    asset_names: list[str],
    objective: str = "max_sharpe",
    allow_short: bool = False,
    max_weight: float = 1.0,
    min_weight: float = 0.0,
    risk_free_rate: float = 0.05,
    n_frontier_points: int = 20,
) -> OptimizationResult:
    """
    Solve mean-variance portfolio optimization.

    Parameters
    ----------
    expected_returns : annualised expected returns per asset
    cov_matrix      : annualised covariance matrix
    objective       : "min_volatility" | "max_sharpe" | "efficient_frontier"
    """
    n = len(asset_names)
    mu = np.asarray(expected_returns, dtype=float)
    sigma = np.asarray(cov_matrix, dtype=float)

    # Ensure PSD covariance (small eigenvalue floor)
    eigvals, eigvecs = np.linalg.eigh(sigma)
    eigvals = np.clip(eigvals, 1e-10, None)
    sigma = eigvecs @ np.diag(eigvals) @ eigvecs.T
    sigma = (sigma + sigma.T) / 2

    bounds = _bounds(n, allow_short, min_weight, max_weight)
    use_gurobi = _GUROBI_AVAILABLE

    if objective == "min_volatility":
        w, solver = _solve_qp(mu, sigma, bounds, target_return=None, use_gurobi=use_gurobi)
        if w is None:
            raise ValueError("최적화에 실패했습니다. 제약조건이 너무 엄격하거나 데이터가 부족합니다.")
        ret, vol, sharpe = _portfolio_stats(w, mu, sigma, risk_free_rate)
        weights_dict = {asset_names[i]: float(round(w[i], 6)) for i in range(n)}
        return OptimizationResult(
            optimal_weights=weights_dict,
            expected_return=ret,
            expected_volatility=vol,
            sharpe_ratio=sharpe,
            solver=solver,
            solver_status="Optimal",
        )

    # Compute efficient frontier (needed for max_sharpe and efficient_frontier modes)
    r_min, r_max = _return_range(mu, sigma, bounds)
    targets = np.linspace(r_min, r_max, max(n_frontier_points, 10))

    frontier: list[FrontierPoint] = []
    last_solver = "scipy"
    for target in targets:
        w, solver = _solve_qp(mu, sigma, bounds, target_return=target, use_gurobi=use_gurobi)
        if w is None:
            continue
        last_solver = solver
        ret, vol, sharpe = _portfolio_stats(w, mu, sigma, risk_free_rate)
        frontier.append(
            FrontierPoint(
                expected_return=ret,
                expected_volatility=vol,
                sharpe_ratio=sharpe,
                weights={asset_names[i]: float(round(w[i], 6)) for i in range(n)},
            )
        )

    if not frontier:
        raise ValueError("효율적 프론티어를 계산할 수 없습니다. 제약조건을 확인해주세요.")

    if objective == "efficient_frontier":
        # Return the max-sharpe point as primary, full frontier as list
        best = max(frontier, key=lambda p: p.sharpe_ratio)
        return OptimizationResult(
            optimal_weights=best.weights,
            expected_return=best.expected_return,
            expected_volatility=best.expected_volatility,
            sharpe_ratio=best.sharpe_ratio,
            frontier_points=frontier,
            solver=last_solver,
            solver_status="Optimal",
        )

    # max_sharpe
    best = max(frontier, key=lambda p: p.sharpe_ratio)
    return OptimizationResult(
        optimal_weights=best.weights,
        expected_return=best.expected_return,
        expected_volatility=best.expected_volatility,
        sharpe_ratio=best.sharpe_ratio,
        frontier_points=[],
        solver=last_solver,
        solver_status="Optimal",
    )
