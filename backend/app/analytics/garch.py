from __future__ import annotations

import numpy as np
import pandas as pd
from arch import arch_model


def calculate_garch_volatility(return_series: pd.Series) -> float | None:
    cleaned = return_series.dropna()
    if len(cleaned) < 60:
        return None

    scaled_returns = cleaned.astype(float) * 100
    model = arch_model(scaled_returns, mean="Constant", vol="GARCH", p=1, q=1, rescale=False)
    result = model.fit(disp="off")
    conditional_vol = float(result.conditional_volatility.iloc[-1]) / 100
    return conditional_vol * np.sqrt(252)
