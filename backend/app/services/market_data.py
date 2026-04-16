from __future__ import annotations

import json
import re
import time
from functools import lru_cache
from pathlib import Path

import pandas as pd
import yfinance as yf

_KR_STOCKS_PATH = Path(__file__).parent.parent / "data" / "kr_stocks.json"


@lru_cache(maxsize=1)
def _load_kr_stocks() -> list[dict]:
    with _KR_STOCKS_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _is_korean(text: str) -> bool:
    return bool(re.search(r"[가-힣]", text))


def _search_kr_static(query: str) -> list[dict]:
    stocks = _load_kr_stocks()
    query_lower = query.lower()
    results = []
    for s in stocks:
        if query_lower in s["name"].lower() or query_lower in s["code"]:
            suffix = ".KQ" if s["market"] == "KOSDAQ" else ".KS"
            results.append({
                "symbol": f"{s['code']}{suffix}",
                "name": s["name"],
                "type": "ETF" if s["name"].startswith(("KODEX", "TIGER", "KBSTAR", "ARIRANG", "HANARO", "SOL")) else "EQUITY",
                "exchange": s["market"],
            })
        if len(results) >= 8:
            break
    return results


def _search_yahoo(query: str) -> list[dict]:
    try:
        quotes = yf.Search(query, max_results=8, news_count=0).quotes
    except Exception:  # noqa: BLE001
        return []
    output = []
    for r in quotes:
        symbol = r.get("symbol", "")
        if not symbol:
            continue
        name = r.get("shortname") or r.get("longname") or symbol
        output.append({
            "symbol": symbol,
            "name": name,
            "type": r.get("quoteType", ""),
            "exchange": r.get("exchange", ""),
        })
    return output


def search_ticker(query: str) -> list[dict]:
    if _is_korean(query):
        return _search_kr_static(query)
    return _search_yahoo(query)


@lru_cache(maxsize=256)
def fetch_yahoo_prices(ticker: str, period: str) -> tuple[pd.DataFrame, str | None]:
    ticker_obj = yf.Ticker(ticker)
    history = None
    for attempt in range(3):
        try:
            history = ticker_obj.history(period=period, auto_adjust=True)
            break
        except Exception as exc:  # noqa: BLE001
            from yfinance.exceptions import YFRateLimitError
            msg = str(exc).lower()
            is_rate_limit = isinstance(exc, YFRateLimitError) or "429" in msg or "too many requests" in msg or "rate limit" in msg
            if is_rate_limit and attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    if history is None or history.empty:
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
