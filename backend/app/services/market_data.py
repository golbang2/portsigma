from __future__ import annotations

from functools import lru_cache

import pandas as pd
import yfinance as yf


@lru_cache(maxsize=256)
def fetch_yahoo_prices(ticker: str, period: str) -> tuple[pd.DataFrame, str | None]:
    ticker_obj = yf.Ticker(ticker)
    history = ticker_obj.history(period=period, auto_adjust=True)
    if history.empty:
        raise ValueError(f"No Yahoo Finance price history was found for '{ticker}'.")

    prices = history.reset_index()[["Date", "Close"]].copy()
    prices["Date"] = pd.to_datetime(prices["Date"]).dt.tz_localize(None)
    prices.rename(columns={"Close": "price"}, inplace=True)

    detected_currency = None
    try:
        detected_currency = ticker_obj.fast_info.get("currency")
    except Exception:  # noqa: BLE001
        detected_currency = None

    # NOTE: ticker_obj.info is intentionally omitted — it makes a slow secondary HTTP request
    # that frequently times out or gets rate-limited on cloud deployments (Render/AWS IPs).
    # fast_info is sufficient; callers fall back to "USD" when currency is None.

    return prices, detected_currency


@lru_cache(maxsize=512)
def fetch_fx_series(base_currency: str, quote_currency: str, period: str) -> pd.Series:
    if base_currency == quote_currency:
        return pd.Series(dtype=float)

    direct_ticker = f"{base_currency}{quote_currency}=X"
    history = yf.Ticker(direct_ticker).history(period=period, auto_adjust=False)
    if not history.empty:
        fx = history.reset_index()[["Date", "Close"]].copy()
        fx["Date"] = pd.to_datetime(fx["Date"]).dt.tz_localize(None)
        return fx.set_index("Date")["Close"].sort_index()

    inverse_ticker = f"{quote_currency}{base_currency}=X"
    inverse_history = yf.Ticker(inverse_ticker).history(period=period, auto_adjust=False)
    if not inverse_history.empty:
        fx = inverse_history.reset_index()[["Date", "Close"]].copy()
        fx["Date"] = pd.to_datetime(fx["Date"]).dt.tz_localize(None)
        return 1 / fx.set_index("Date")["Close"].sort_index()

    if base_currency != "USD" and quote_currency != "USD":
        to_usd = fetch_fx_series(base_currency, "USD", period)
        from_usd = fetch_fx_series("USD", quote_currency, period)
        if not to_usd.empty and not from_usd.empty:
            combined_index = to_usd.index.union(from_usd.index)
            return to_usd.reindex(combined_index).ffill() * from_usd.reindex(combined_index).ffill()

    raise ValueError(f"FX rate series for {base_currency}/{quote_currency} could not be loaded from Yahoo Finance.")
