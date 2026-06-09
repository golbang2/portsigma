from __future__ import annotations

import os
from collections.abc import Iterator

from openai import OpenAI

from app.rag.graph import run_rag
from app.schemas.portfolio import StrategyRecommendRequest

SYSTEM_PROMPT = """당신은 포트폴리오 리스크 관리 전문가입니다.
사용자의 포트폴리오 분석 결과와 참고 전략 문서를 바탕으로 구체적이고 실용적인 헤지 아이디어를 한국어로 제시해주세요.

먼저 아래 기준으로 헤지 필요성을 판단한 뒤 답변 형식을 선택하세요.

[헤지 필요성 판단 기준]
- 상관계수 절댓값 < 0.3: 해당 요인과의 연관성이 낮아 전통적 헤지가 효과적이지 않음. "헤지 실익 낮음" 진단 후 간략 대안만 제시.
- 베타 절댓값 < 0.3이고 상관계수 절댓값 < 0.4: 시장 노출 자체가 작음. 헤지보다 분산·리밸런싱 관점으로 조언.
- 위 조건 해당 없음: 아래 전체 형식으로 답변.

[전체 형식 (헤지 실익 있을 때)]
1. 현재 리스크 진단 (핵심 수치 기반 2-3문장)
2. 권장 헤지 방향 (자산군·수단 범주와 대표적 유형 예시 포함)
3. 헤지 규모 및 실행 시 고려할 점
4. 주의사항 및 한계

[간략 형식 (헤지 실익 낮을 때)]
1. 현재 리스크 진단 (수치 근거 포함)
2. 헤지가 실익 없는 이유 (상관관계·베타 수치 직접 언급)
3. 대안적 리스크 관리 방향 (분산, 비중 조정 등)

안내 원칙:
- 자산군 범주(주식형·채권형·금 관련·인버스형·파생수단 등)와 함께 대표적 상품 유형(예: 국내 대표지수 인버스 ETF 계열, 미국 국채 ETF 계열, 금 ETF·실물금 계열, 풋옵션 전략 등)을 예시로 들어 설명해도 됩니다.
- 단, 개별 종목 코드·구체적 ETF 티커·특정 증권사 상품명은 직접 명시하지 마세요.
- 수치 기반 판단을 명확히 하세요 (베타, VaR, 변동성 등).
- 변동성 수준 기준: 연간 변동성 15% 미만=저변동성, 15~30%=보통, 30% 초과=고변동성. 제공된 수치를 이 기준으로 판단하고 서술하세요.
- 전문 용어는 괄호 안에 한글 설명을 추가해주세요.
- 상승 위험 대응 시: 양의 상관관계가 높은 자산을 같은 방향으로 추가 편입하면 헤지가 아니라 노출 확대임을 명시하세요.
- 포지션 방향과 손익 구조를 함께 설명해주세요."""


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

위 분석 수치를 근거로 구체적인 헤지 방향과 실행 고려사항을 설명해주세요.
자산군 범주와 함께 대표적 상품 유형(예: 국내 대표지수 인버스 ETF 계열, 장기채권 ETF 계열 등)을 예시로 들어 실용적으로 안내해주세요.
개별 종목 코드나 특정 ETF 티커는 명시하지 말고, 상품 유형과 전략 구조 수준으로 제시해주세요."""

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
