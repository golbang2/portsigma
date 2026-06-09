from __future__ import annotations

import os
from datetime import date, timedelta
from functools import lru_cache

import requests

# KOFR fallback: updated 2026-06
_FALLBACK_RATE = 0.02510
_FALLBACK_SOURCE = "고정값 (2.510%)"

# BOK ECOS API — 시장금리(일별) 817Y002
# KOFR item code: 010700000 (무위험지표금리)
# NOTE: StatisticSearch requires a real BOK_API_KEY (sample key is read-only for listings)
_ECOS_URL = (
    "https://ecos.bok.or.kr/api/StatisticSearch"
    "/{key}/json/kr/1/10/817Y002/DD/{start}/{end}/010700000"
)


@lru_cache(maxsize=1)
def _fetch_cached(date_key: str) -> tuple[float, str]:
    """Try BOK ECOS → fixed fallback. Cached per calendar day."""
    api_key = os.getenv("BOK_API_KEY")
    if api_key:
        try:
            end = date.today()
            start = end - timedelta(days=14)
            url = _ECOS_URL.format(
                key=api_key,
                start=start.strftime("%Y%m%d"),
                end=end.strftime("%Y%m%d"),
            )
            resp = requests.get(url, timeout=5)
            resp.raise_for_status()
            data = resp.json()
            rows = data.get("StatisticSearch", {}).get("row", [])
            if rows:
                return float(rows[-1]["DATA_VALUE"]) / 100.0, "KOFR (BOK)"
        except Exception:  # noqa: BLE001
            pass

    return _FALLBACK_RATE, _FALLBACK_SOURCE


def get_risk_free_rate() -> dict:
    """Return latest risk-free rate with its source label."""
    rate, source = _fetch_cached(date.today().isoformat())
    return {"rate": rate, "source": source}
