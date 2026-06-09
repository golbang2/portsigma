from __future__ import annotations

import numpy as np

from app.analytics.dcc import calculate_dcc_correlation_matrix
from app.analytics.garch import calculate_garch_volatility
from app.analytics.optimizer import FrontierPoint, OptimizationResult, optimize_portfolio
from app.schemas.portfolio import OptimizePortfolioRequest, OptimizePortfolioResponse, FrontierPointSchema
from app.services.portfolio import build_portfolio_context

TRADING_DAYS_PER_YEAR = 252


def _build_covariance_matrix(
    garch_vols: np.ndarray,
    dcc_corr: np.ndarray,
) -> np.ndarray:
    """Combine GARCH per-asset annualised volatilities with DCC correlation matrix."""
    # Σ_ij = ρ_ij * σ_i * σ_j
    outer = np.outer(garch_vols, garch_vols)
    return dcc_corr * outer


def run_portfolio_optimization(payload: OptimizePortfolioRequest) -> OptimizePortfolioResponse:
    context = build_portfolio_context(payload)

    returns_df = context.returns.dropna(how="all")
    asset_names = list(returns_df.columns)
    n = len(asset_names)

    if n < 2:
        raise ValueError("최적화에는 최소 2개 이상의 자산 수익률 데이터가 필요합니다.")

    # Per-asset GARCH annualised volatility
    garch_vols: list[float] = []
    for name in asset_names:
        vol = calculate_garch_volatility(returns_df[name])
        if vol is None:
            # fallback to historical std
            vol = float(returns_df[name].std(ddof=1)) * np.sqrt(TRADING_DAYS_PER_YEAR)
        garch_vols.append(vol)
    garch_array = np.array(garch_vols)

    # DCC correlation matrix (latest time point)
    try:
        dcc_corr_df = calculate_dcc_correlation_matrix(returns_df)
        dcc_corr = dcc_corr_df.reindex(index=asset_names, columns=asset_names).to_numpy(dtype=float)
    except Exception:  # noqa: BLE001
        # fallback: sample correlation
        dcc_corr = returns_df.corr().reindex(index=asset_names, columns=asset_names).to_numpy(dtype=float)

    # Annualised covariance matrix
    cov_matrix = _build_covariance_matrix(garch_array, dcc_corr)

    # Annualised expected returns (historical mean)
    expected_returns = np.array([
        float(returns_df[name].mean()) * TRADING_DAYS_PER_YEAR
        for name in asset_names
    ])

    result: OptimizationResult = optimize_portfolio(
        expected_returns=expected_returns,
        cov_matrix=cov_matrix,
        asset_names=asset_names,
        objective=payload.objective,
        allow_short=payload.allow_short,
        max_weight=payload.max_weight,
        min_weight=payload.min_weight,
        risk_free_rate=payload.risk_free_rate,
        n_frontier_points=payload.n_frontier_points,
    )

    # Current market weights from context
    weight_series = context.asset_frame.set_index("asset")["market_weight_report"]
    current_weights = {
        name: float(weight_series.get(name, 0.0))
        for name in asset_names
    }

    frontier_out: list[FrontierPointSchema] = [
        FrontierPointSchema(
            expected_return=fp.expected_return,
            expected_volatility=fp.expected_volatility,
            sharpe_ratio=fp.sharpe_ratio,
            weights=fp.weights,
        )
        for fp in result.frontier_points
    ]

    return OptimizePortfolioResponse(
        portfolio_name=payload.portfolio_name,
        report_currency=context.report_currency,
        period=payload.period,
        objective=payload.objective,
        optimal_weights=result.optimal_weights,
        expected_return=result.expected_return,
        expected_volatility=result.expected_volatility,
        sharpe_ratio=result.sharpe_ratio,
        current_weights=current_weights,
        frontier_points=frontier_out,
        solver=result.solver,
        solver_status=result.solver_status,
        warnings=context.warnings,
    )
