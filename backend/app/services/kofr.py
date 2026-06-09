from __future__ import annotations

import os
from datetime import date, timedelta
from functools import lru_cache

import requests

_FALLBACK_RATE = 0.02510
_FALLBACK_SOURCE = "고정값 (2.510%)"

_BASE = "https://ecos.bok.or.kr/api"
# 817Y002 = 시장금리(일별)
_TABLE = "817Y002"


def _get_kofr_item_code(api_key: str) -> str | None:
    """Find the KOFR item code in 817Y002 by searching item names."""
    try:
        url = f"{_BASE}/StatisticItemList/{api_key}/json/kr/1/100/{_TABLE}"
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        rows = resp.json().get("StatisticItemList", {}).get("row", [])
        for row in rows:
            name = row.get("ITEM_NAME", "")
            if "KOFR" in name or "무위험지표금리" in name or "무위험" in name:
                return row["ITEM_CODE"]
    except Exception:  # noqa: BLE001
        pass
    return None


@lru_cache(maxsize=1)
def _fetch_cached(date_key: str) -> tuple[float, str]:
    """Try BOK ECOS KOFR → fixed fallback. Cached per calendar day."""
    api_key = os.getenv("BOK_API_KEY")
    if not api_key:
        return _FALLBACK_RATE, _FALLBACK_SOURCE

    item_code = _get_kofr_item_code(api_key)
    if not item_code:
        return _FALLBACK_RATE, _FALLBACK_SOURCE

    try:
        end = date.today()
        start = end - timedelta(days=14)
        url = (
            f"{_BASE}/StatisticSearch/{api_key}/json/kr/1/10"
            f"/{_TABLE}/DD/{start.strftime('%Y%m%d')}/{end.strftime('%Y%m%d')}/{item_code}"
        )
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        rows = resp.json().get("StatisticSearch", {}).get("row", [])
        if rows:
            return float(rows[-1]["DATA_VALUE"]) / 100.0, "KOFR (BOK)"
    except Exception:  # noqa: BLE001
        pass

    return _FALLBACK_RATE, _FALLBACK_SOURCE


def get_risk_free_rate() -> dict:
    rate, source = _fetch_cached(date.today().isoformat())
    return {"rate": rate, "source": source}
