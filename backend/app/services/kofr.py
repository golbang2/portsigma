from __future__ import annotations

import os
import time
from functools import lru_cache

import requests

# KOFR fallback: approximate recent rate (updated manually if needed)
_KOFR_FALLBACK = 0.026  # 2.6%

# BOK ECOS API — KOFR overnight rate
# Statistics table: 817Y002, item: 0101000
_ECOS_URL = "https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/1/817Y002/DD/{start}/{end}/0101000"


@lru_cache(maxsize=1)
def _fetch_kofr_cached(date_key: str) -> float:
    """Fetch latest KOFR from BOK ECOS API. Cached per calendar day."""
    api_key = os.getenv("BOK_API_KEY", "sample")
    # Request last 30 days to ensure we get a recent observation
    from datetime import date, timedelta
    end = date.today()
    start = end - timedelta(days=30)
    url = _ECOS_URL.format(
        key=api_key,
        start=start.strftime("%Y%m%d"),
        end=end.strftime("%Y%m%d"),
    )
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        rows = data.get("StatisticSearch", {}).get("row", [])
        if not rows:
            return _KOFR_FALLBACK
        # rows are sorted ascending; take the last (most recent) value
        latest = rows[-1].get("DATA_VALUE", "")
        return float(latest) / 100.0
    except Exception:  # noqa: BLE001
        return _KOFR_FALLBACK


def get_kofr() -> float:
    """Return the latest annualised KOFR rate (e.g. 0.026 for 2.6%)."""
    from datetime import date
    date_key = date.today().isoformat()
    return _fetch_kofr_cached(date_key)
