from __future__ import annotations

import os
from collections.abc import Iterator

from openai import OpenAI

from app.rag.graph import run_rag
from app.schemas.portfolio import StrategyRecommendRequest

SYSTEM_PROMPT = """당신은 포트폴리오 리스크 분석 전문가입니다.
제공된 포트폴리오 수치와 참고 문서를 바탕으로, 헤지가 실제로 효과적인지 먼저 판단한 뒤 그에 맞는 조언을 한국어로 제시하세요.

참고 문서의 첫 번째 항목은 항상 헤지 적합성 판단 기준입니다. 이 기준을 수치에 적용해 헤지 적합 여부를 먼저 결정하고, 그 결과에 따라 아래 형식 중 하나를 사용하세요.

[헤지 적합 시]
1. 현재 리스크 진단 (핵심 수치 기반 2-3문장)
2. 권장 헤지 방향 (자산군·수단 범주와 대표적 유형 예시 포함)
3. 헤지 규모 및 실행 시 고려할 점
4. 주의사항 및 한계

[헤지 부적합 시]
1. 현재 리스크 진단 (수치 근거 포함)
2. 헤지가 실익 없는 이유 (상관관계·베타 수치 직접 언급)
3. 대안적 리스크 관리 방향

공통 원칙:
- 개별 종목 코드·ETF 티커·특정 증권사 상품명은 직접 명시하지 마세요.
- 전문 용어는 괄호 안에 한글 설명을 추가하세요.
- 상승 위험 대응 시 양의 상관관계 자산을 같은 방향으로 추가하면 헤지가 아니라 노출 확대임을 명시하세요.
- 포지션 방향과 손익 구조를 함께 설명하세요."""


def _fmt(v: float | None, pct: bool = False, d: int = 2) -> str:
    if v is None:
        return "N/A"
    return f"{v * 100:.{d}f}%" if pct else f"{v:.{d}f}"


def stream_strategy_recommendation(payload: StrategyRecommendRequest) -> Iterator[str]:
    api_key = payload.openai_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API 키가 필요합니다. 키를 입력해주세요.")

    direction_label = "상승" if payload.direction == "up" else "하락"

    # LangGraph 워크플로우: 리스크 분류 → 쿼리 빌드 → 검색 → 충분성 체크 (→ 재시도)
    docs, risk_class = run_rag(payload, api_key=api_key)
    docs_text = "\n\n---\n\n".join(docs) if docs else "관련 문서를 찾지 못했습니다."

    _RISK_CLASS_LABEL = {
        "high_market_risk": "시장 리스크 높음 (고베타·하락 방향)",
        "fx_dominant":      "환율 리스크 지배적",
        "high_volatility":  "고변동성 포트폴리오",
        "general":          "일반",
    }
    risk_label = _RISK_CLASS_LABEL.get(risk_class, risk_class)

    # ── 포트폴리오 분석 수치 블록 ──────────────────────────────────────────────
    metrics_lines = [
        f"- 리스크 분류: {risk_label}",
        f"- 포트폴리오명: {payload.portfolio_name}",
        f"- 기준 통화: {payload.report_currency}",
        f"- 리스크 요인: {payload.factor_label}",
        f"- 리스크 방향: {direction_label}",
        f"- 상관계수: {_fmt(payload.correlation)}",
        f"- 베타: {_fmt(payload.beta)}",
        f"- 헤지비율: {_fmt(payload.hedge_ratio)}",
        f"- 포트폴리오 연간 변동성(GARCH): {_fmt(payload.portfolio_volatility, pct=True)}"
        + (
            " [고변동성]" if (payload.portfolio_volatility or 0) > 0.30
            else " [보통변동성]" if (payload.portfolio_volatility or 0) > 0.15
            else " [저변동성]"
        ),
        f"- 요인 연간 변동성: {_fmt(payload.factor_volatility, pct=True)}",
    ]
    if payload.var_95_return is not None:
        metrics_lines.append(f"- VaR 95% (일간 수익률 기준): {_fmt(payload.var_95_return, pct=True)}")
    if payload.cvar_95_return is not None:
        metrics_lines.append(f"- CVaR 95% (Expected Shortfall): {_fmt(payload.cvar_95_return, pct=True)}")
    if payload.max_drawdown is not None:
        metrics_lines.append(f"- 최대 낙폭(MDD): {_fmt(payload.max_drawdown, pct=True)}")
    if payload.sharpe_ratio is not None:
        metrics_lines.append(f"- 샤프 비율: {_fmt(payload.sharpe_ratio)}")
    if payload.asset_names:
        metrics_lines.append(f"- 보유 자산: {', '.join(payload.asset_names)}")

    user_message = f"""## 포트폴리오 분석 결과

{chr(10).join(metrics_lines)}

## 참고 전략 문서

{docs_text}

참고 문서의 헤지 적합성 판단 기준을 수치에 적용해 헤지 적합 여부를 먼저 판단하고, 그에 맞는 형식으로 조언해주세요.
자산군 범주와 함께 대표적 상품 유형을 예시로 들어 실용적으로 안내하되, 개별 종목 코드나 ETF 티커는 명시하지 마세요."""

    if payload.user_context and payload.user_context.strip():
        user_message += f"\n\n## 사용자 추가 요청\n\n{payload.user_context.strip()}"

    client = OpenAI(api_key=api_key)  # noqa: S106
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        stream=True,
        max_tokens=1500,
        temperature=0.35,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
