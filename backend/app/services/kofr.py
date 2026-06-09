from __future__ import annotations

import os
from datetime import date, timedelta
from functools import lru_cache

import requests

_FALLBACK_RATE = 0.026
_FALLBACK_SOURCE = "고정값 (2.6%)"

_ECOS_URL = (
    "https://ecos.bok.or.kr/api/StatisticSearch"
    "/{key}/json/kr/1/1/817Y002/DD/{start}/{end}/0101000"
)
# SOFR from FRED public CSV — no API key required
_SOFR_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SOFR"


@lru_cache(maxsize=1)
def _fetch_cached(date_key: str) -> tuple[float, str]:
    """Try BOK KOFR → SOFR(FRED) → fixed fallback. Cached per calendar day."""
    # --- 1. BOK KOFR ---
    api_key = os.getenv("BOK_API_KEY")
    if api_key:
        try:
            end = date.today()
            start = end - timedelta(days=30)
            url = _ECOS_URL.format(
                key=api_key,
                start=start.strftime("%Y%m%d"),
                end=end.strftime("%Y%m%d"),
            )
            resp = requests.get(url, timeout=5)
            resp.raise_for_status()
            rows = resp.json().get("StatisticSearch", {}).get("row", [])
            if rows:
                return float(rows[-1]["DATA_VALUE"]) / 100.0, "KOFR (BOK)"
        except Exception:  # noqa: BLE001
            pass

    # --- 2. SOFR (FRED, no key needed) ---
    try:
        resp = requests.get(_SOFR_URL, timeout=5)
        resp.raise_for_status()
        lines = [l for l in resp.text.strip().splitlines() if not l.startswith("DATE")]
        if lines:
            last = lines[-1].split(",")
            val = last[1].strip()
            if val and val != ".":
                return float(val) / 100.0, "SOFR (FRED)"
    except Exception:  # noqa: BLE001
        pass

    return _FALLBACK_RATE, _FALLBACK_SOURCE


def get_risk_free_rate() -> dict:
    """Return latest risk-free rate with its source label."""
    rate, source = _fetch_cached(date.today().isoformat())
    return {"rate": rate, "source": source}
