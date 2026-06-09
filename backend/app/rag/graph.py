"""
RAG 워크플로우 (순수 Python)

흐름:
  classify_risk → build_query → retrieve_docs → check_sufficiency
                                                      │ 부족 & 재시도 가능
                                                 refine_query → retrieve_docs
                                                      │ 충분 or 2회 초과
                                                    END  →  (호출부에서 LLM 스트리밍)
"""
from __future__ import annotations

from app.rag.engine import retrieve
from app.schemas.portfolio import StrategyRecommendRequest


# ── Risk classification ────────────────────────────────────────────────────────

def _classify(p: StrategyRecommendRequest) -> str:
    if p.factor_type == "asset_fx":
        return "fx_dominant"

    beta = p.beta or 0.0
    var  = p.var_95_return or 0.0
    vol  = p.portfolio_volatility or 0.0
    mdd  = p.max_drawdown or 0.0

    if beta > 1.2 and (var < -0.02 or p.direction == "down"):
        return "high_market_risk"
    if vol > 0.30 or mdd < -0.20:
        return "high_volatility"
    return "general"


# ── 리스크 유형별 쿼리 각도 ────────────────────────────────────────────────────

_RISK_ANGLES: dict[str, list[str]] = {
    "high_market_risk": [
        "시장 지수 하락 베타 헤지 인버스 ETF 선물 풋옵션",
        "포트폴리오 시장 민감도 방어 상관관계 분산 채권 편입",
    ],
    "fx_dominant": [
        "환율 FX 헤지 전략 통화 리스크 환헤지형 ETF",
        "달러 원화 환노출 통화선물 옵션 자연 헤지",
    ],
    "high_volatility": [
        "변동성 급등 포트폴리오 VaR CVaR 포지션 축소",
        "고변동성 분산 강화 채권 금 ETF 리밸런싱 트리거",
    ],
    "general": [
        "포트폴리오 헤지 리스크 관리 전략 분산 방어",
        "허용 손실 한도 헤지비율 실행 고려사항",
    ],
}

_CLASS_KEYWORDS: dict[str, list[str]] = {
    "high_market_risk": ["베타", "인버스", "헤지비율", "선물", "풋옵션"],
    "fx_dominant":      ["환율", "FX", "환헤지", "통화", "달러"],
    "high_volatility":  ["변동성", "VaR", "CVaR", "MDD", "리밸런싱"],
    "general":          ["헤지", "리스크", "분산", "포트폴리오"],
}


def _angle_query(risk_class: str, attempt: int) -> str:
    angles = _RISK_ANGLES.get(risk_class, _RISK_ANGLES["general"])
    return angles[min(attempt, len(angles) - 1)]


def _is_sufficient(docs: list[str], risk_class: str) -> bool:
    if len(docs) < 2:
        return False
    keywords = _CLASS_KEYWORDS.get(risk_class, _CLASS_KEYWORDS["general"])
    combined = " ".join(docs)
    return sum(1 for kw in keywords if kw in combined) >= 2


def _fmt(v: float | None, pct: bool = False) -> str:
    if v is None:
        return ""
    return f"{v*100:.2f}%" if pct else f"{v:.2f}"


def _base_query(p: StrategyRecommendRequest) -> str:
    direction = "상승" if p.direction == "up" else "하락"
    parts = [f"{p.factor_label} {direction} 리스크 헤지 전략"]
    if p.beta is not None:
        parts.append(f"베타 {_fmt(p.beta)}")
    if p.correlation is not None:
        parts.append(f"상관계수 {_fmt(p.correlation)}")
    if p.portfolio_volatility is not None:
        parts.append(f"포트폴리오 변동성 {_fmt(p.portfolio_volatility, pct=True)}")
    if p.var_95_return is not None:
        parts.append(f"VaR95 {_fmt(p.var_95_return, pct=True)}")
    if p.max_drawdown is not None:
        parts.append(f"최대낙폭 {_fmt(p.max_drawdown, pct=True)}")
    if p.asset_names:
        parts.append("보유자산: " + ", ".join(p.asset_names[:5]))
    return " ".join(parts)


# ── 공개 인터페이스 ─────────────────────────────────────────────────────────────

def run_rag(
    payload: StrategyRecommendRequest,
    api_key: str | None = None,
) -> tuple[list[str], str]:
    """RAG 워크플로우 실행. (최종 검색 문서들, 리스크 분류) 반환."""
    risk_class = _classify(payload)

    # 1차 검색
    base  = _base_query(payload)
    angle = _angle_query(risk_class, 0)
    docs  = retrieve(f"{base} {angle}", n_results=4,
                     factor_type=payload.factor_type, api_key=api_key)

    # 충분성 체크 → 부족하면 1회 재시도
    if not _is_sufficient(docs, risk_class):
        refined = f"{payload.factor_label} 포트폴리오 {_angle_query(risk_class, 1)}"
        docs = retrieve(refined, n_results=4,
                        factor_type=payload.factor_type, api_key=api_key)

    return docs, risk_class
