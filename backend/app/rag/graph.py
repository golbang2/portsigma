"""
LangGraph 기반 RAG 워크플로우

흐름:
  classify_risk → build_query → retrieve_docs → check_sufficiency
                                                      │ 부족 & 재시도 가능
                                                 refine_query → retrieve_docs
                                                      │ 충분 or 2회 초과
                                                    END  →  (호출부에서 LLM 스트리밍)
"""
from __future__ import annotations

from typing import Literal, TypedDict

from langgraph.graph import END, StateGraph

from app.rag.engine import retrieve
from app.schemas.portfolio import RiskFactorType, StrategyRecommendRequest


# ── State ──────────────────────────────────────────────────────────────────────

class RAGState(TypedDict):
    payload:    StrategyRecommendRequest
    api_key:    str | None
    risk_class: str          # "high_market_risk" | "fx_dominant" | "high_volatility" | "general"
    query:      str
    docs:       list[str]
    attempts:   int          # retrieval 시도 횟수
    sufficient: bool         # 문서 충분 여부


# ── Risk classification ────────────────────────────────────────────────────────

def _classify(p: StrategyRecommendRequest) -> str:
    """포트폴리오 수치와 factor_type을 보고 리스크 유형을 분류한다."""
    if p.factor_type == "asset_fx":
        return "fx_dominant"

    beta = p.beta or 0.0
    var  = p.var_95_return or 0.0
    vol  = p.portfolio_volatility or 0.0
    mdd  = p.max_drawdown or 0.0

    corr = abs(p.correlation or 0.0)
    if corr < 0.3:
        return "low_correlation"
    if beta > 1.2 and (var < -0.02 or p.direction == "down"):
        return "high_market_risk"
    if vol > 0.30 or mdd < -0.20:
        return "high_volatility"
    return "general"


# ── 리스크 유형별 쿼리 각도 ────────────────────────────────────────────────────
# attempt=0: 1차 각도 (구체적 전술), attempt=1: 2차 각도 (원리·대안)

_RISK_ANGLES: dict[str, list[str]] = {
    "low_correlation": [
        "낮은 상관관계 헤지 실익 없음 분산 리밸런싱 대안 전략",
        "무상관 포트폴리오 자연 분산 효과 요인 재탐색",
    ],
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


def _angle_query(risk_class: str, attempt: int) -> str:
    angles = _RISK_ANGLES.get(risk_class, _RISK_ANGLES["general"])
    return angles[min(attempt, len(angles) - 1)]


# ── Sufficiency check ─────────────────────────────────────────────────────────

# 리스크 유형별로 기대하는 핵심 키워드
_CLASS_KEYWORDS: dict[str, list[str]] = {
    "low_correlation": ["상관관계", "분산", "리밸런싱", "낮은"],
    "high_market_risk": ["베타", "인버스", "헤지비율", "선물", "풋옵션"],
    "fx_dominant":      ["환율", "FX", "환헤지", "통화", "달러"],
    "high_volatility":  ["변동성", "VaR", "CVaR", "MDD", "리밸런싱"],
    "general":          ["헤지", "리스크", "분산", "포트폴리오"],
}


def _is_sufficient(docs: list[str], risk_class: str) -> bool:
    if len(docs) < 2:
        return False
    keywords = _CLASS_KEYWORDS.get(risk_class, _CLASS_KEYWORDS["general"])
    combined = " ".join(docs)
    hits = sum(1 for kw in keywords if kw in combined)
    return hits >= 2


# ── Query builder ─────────────────────────────────────────────────────────────

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


# ── Graph nodes ────────────────────────────────────────────────────────────────

def node_classify_risk(state: RAGState) -> dict:
    return {"risk_class": _classify(state["payload"])}


def node_build_query(state: RAGState) -> dict:
    p     = state["payload"]
    base  = _base_query(p)
    angle = _angle_query(state["risk_class"], state["attempts"])
    return {"query": f"{base} {angle}"}


def node_retrieve_docs(state: RAGState) -> dict:
    docs = retrieve(
        state["query"],
        n_results=4,
        factor_type=state["payload"].factor_type,
        api_key=state["api_key"],
    )
    return {"docs": docs, "attempts": state["attempts"] + 1}


def node_check_sufficiency(state: RAGState) -> dict:
    return {"sufficient": _is_sufficient(state["docs"], state["risk_class"])}


def node_refine_query(state: RAGState) -> dict:
    """2차 시도: 핵심 지표 + 대체 각도 쿼리."""
    p     = state["payload"]
    angle = _angle_query(state["risk_class"], state["attempts"])
    refined = f"{p.factor_label} 포트폴리오 {angle}"
    return {"query": refined}


# ── Conditional edge ───────────────────────────────────────────────────────────

def _should_retry(state: RAGState) -> Literal["refine_query", "__end__"]:
    if not state["sufficient"] and state["attempts"] < 2:
        return "refine_query"
    return "__end__"


# ── Graph 빌드 ─────────────────────────────────────────────────────────────────

def _build() -> StateGraph:
    g = StateGraph(RAGState)

    g.add_node("classify_risk",     node_classify_risk)
    g.add_node("build_query",       node_build_query)
    g.add_node("retrieve_docs",     node_retrieve_docs)
    g.add_node("check_sufficiency", node_check_sufficiency)
    g.add_node("refine_query",      node_refine_query)

    g.set_entry_point("classify_risk")
    g.add_edge("classify_risk",     "build_query")
    g.add_edge("build_query",       "retrieve_docs")
    g.add_edge("retrieve_docs",     "check_sufficiency")
    g.add_conditional_edges(
        "check_sufficiency",
        _should_retry,
        {"refine_query": "refine_query", "__end__": END},
    )
    g.add_edge("refine_query", "retrieve_docs")

    return g.compile()


rag_graph = _build()


# ── 공개 인터페이스 ─────────────────────────────────────────────────────────────

def run_rag(
    payload: StrategyRecommendRequest,
    api_key: str | None = None,
) -> tuple[list[str], str]:
    """
    LangGraph 워크플로우를 실행하고 (최종 검색 문서들, 리스크 분류) 를 반환한다.
    LLM 스트리밍은 호출부(strategy_recommend.py)에서 담당한다.
    """
    initial: RAGState = {
        "payload":    payload,
        "api_key":    api_key,
        "risk_class": "",
        "query":      "",
        "docs":       [],
        "attempts":   0,
        "sufficient": False,
    }
    final = rag_graph.invoke(initial)
    return final["docs"], final["risk_class"]
