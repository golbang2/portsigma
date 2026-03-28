from __future__ import annotations

import math

import numpy as np
import pandas as pd
from arch import arch_model


def _fit_standardized_residuals(return_series: pd.Series) -> pd.Series:
    cleaned = return_series.dropna().astype(float)
    if len(cleaned) < 60:
        raise ValueError("DCC correlation needs at least 60 return observations per asset.")

    scaled_returns = cleaned * 100
    model = arch_model(scaled_returns, mean="Constant", vol="GARCH", p=1, q=1, rescale=False)
    result = model.fit(disp="off")
    conditional_vol = result.conditional_volatility.replace(0, np.nan)
    standardized = (result.resid / conditional_vol).replace([np.inf, -np.inf], np.nan).dropna()
    standardized.name = return_series.name
    return standardized


def _covariance_matrix(values: np.ndarray) -> np.ndarray:
    cov = np.cov(values, rowvar=False)
    cov = np.atleast_2d(cov).astype(float)
    if cov.shape[0] != cov.shape[1]:
        raise ValueError("DCC covariance matrix is not square.")
    return cov


def _dcc_negative_log_likelihood(standardized: np.ndarray, a: float, b: float) -> float:
    t_count, _ = standardized.shape
    q_bar = _covariance_matrix(standardized)
    q_t = q_bar.copy()
    total = 0.0

    for index in range(1, t_count):
        prev = standardized[index - 1][:, None]
        q_t = (1 - a - b) * q_bar + a * (prev @ prev.T) + b * q_t
        diag = np.sqrt(np.clip(np.diag(q_t), 1e-12, None))
        inv_diag = np.diag(1.0 / diag)
        r_t = inv_diag @ q_t @ inv_diag
        r_t = (r_t + r_t.T) / 2
        sign, logdet = np.linalg.slogdet(r_t)
        if sign <= 0:
            return math.inf
        inv_r = np.linalg.inv(r_t)
        current = standardized[index][:, None]
        quadratic_form = (current.T @ inv_r @ current).item()
        total += logdet + quadratic_form

    return total / 2


def _estimate_dcc_parameters(standardized: np.ndarray) -> tuple[float, float]:
    candidate_a = [0.01, 0.02, 0.03, 0.05, 0.08]
    candidate_b = [0.90, 0.93, 0.95, 0.97, 0.98]
    best_params = (0.02, 0.97)
    best_score = math.inf

    for a in candidate_a:
        for b in candidate_b:
            if a + b >= 0.999:
                continue
            score = _dcc_negative_log_likelihood(standardized, a, b)
            if score < best_score:
                best_score = score
                best_params = (a, b)

    return best_params


def calculate_dcc_correlation_matrix(return_frame: pd.DataFrame) -> pd.DataFrame:
    if return_frame.shape[1] == 1:
        asset = return_frame.columns[0]
        return pd.DataFrame([[1.0]], index=[asset], columns=[asset])

    standardized_columns = [_fit_standardized_residuals(return_frame[column]) for column in return_frame.columns]
    standardized_frame = pd.concat(standardized_columns, axis=1, join="inner").dropna()
    if len(standardized_frame) < 60:
        raise ValueError("DCC correlation needs at least 60 overlapping standardized return observations.")

    standardized = standardized_frame.to_numpy(dtype=float)
    q_bar = _covariance_matrix(standardized)
    a, b = _estimate_dcc_parameters(standardized)
    q_t = q_bar.copy()

    for index in range(1, standardized.shape[0]):
        prev = standardized[index - 1][:, None]
        q_t = (1 - a - b) * q_bar + a * (prev @ prev.T) + b * q_t

    diag = np.sqrt(np.clip(np.diag(q_t), 1e-12, None))
    inv_diag = np.diag(1.0 / diag)
    r_t = inv_diag @ q_t @ inv_diag
    r_t = np.clip((r_t + r_t.T) / 2, -1.0, 1.0)

    return pd.DataFrame(r_t, index=standardized_frame.columns, columns=standardized_frame.columns)
