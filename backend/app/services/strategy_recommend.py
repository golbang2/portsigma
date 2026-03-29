from __future__ import annotations

import os
from collections.abc import Iterator

from openai import OpenAI

from app.rag.engine import retrieve
from app.schemas.portfolio import StrategyRecommendRequest

SYSTEM_PROMPT = """당신은 포트폴리오 리스크 관리 전문가입니다.
사용자의 포트폴리오 분석 결과와 참고 전략 문서를 바탕으로 교육적이고 일반적인 헤지 아이디어를 한국어로 제시해주세요.

다음 형식으로 답변해주세요:
1. 현재 상황 요약 (2-3문장)
2. 가능한 헤지 방향 (자산군 또는 수단 범주 중심)
3. 실행 시 고려할 점
4. 주의사항

전문 용어는 괄호 안에 한글 설명을 추가해주세요.
특정 종목명, 개별 ETF 티커, 특정 상품명, 매수 지시형 표현은 사용하지 말고,
지수 인버스형 수단, 채권형 자산, 금 관련 자산, 옵션 기반 방어 전략처럼 일반적인 범주 수준으로만 설명해주세요.
특히 사용자가 상승 위험에 대비하려는 상황이라면, 상관관계 숫자만으로 방어 적합성을 단정하지 말고
포지션 방향, 베타, 수단의 손익 구조를 함께 설명해주세요.
포트폴리오와 대상 자산의 양의 상관관계가 높을 때 그 대상을 같은 방향으로 추가 편입하는 것은
위험 완화가 아니라 같은 방향 노출 확대가 될 수 있다는 점도 분명히 설명해주세요."""


def _format_value(v: float | None, as_percent: bool = False, decimals: int = 3) -> str:
    if v is None:
        return "N/A"
    if as_percent:
        return f"{v * 100:.2f}%"
    return f"{v:.{decimals}f}"


def stream_strategy_recommendation(payload: StrategyRecommendRequest) -> Iterator[str]:
    api_key = payload.openai_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API 키가 필요합니다. 키를 입력해주세요.")

    direction_label = "상승" if payload.direction == "up" else "하락"
    query = (
        f"{payload.factor_label} {direction_label} 리스크 헤지 전략 "
        f"베타 {_format_value(payload.beta)} 상관계수 {_format_value(payload.correlation)}"
    )
    docs = retrieve(query, api_key=api_key)
    docs_text = "\n\n---\n\n".join(docs) if docs else "관련 문서를 찾지 못했습니다."

    user_message = f"""## 포트폴리오 분석 결과

- 포트폴리오명: {payload.portfolio_name}
- 기준 통화: {payload.report_currency}
- 리스크 요인: {payload.factor_label}
- 리스크 방향: {direction_label}
- 상관계수: {_format_value(payload.correlation)}
- 베타: {_format_value(payload.beta)}
- 헤지비율: {_format_value(payload.hedge_ratio)}
- 포트폴리오 연간 변동성: {_format_value(payload.portfolio_volatility, as_percent=True)}
- 요인 연간 변동성: {_format_value(payload.factor_volatility, as_percent=True)}

## 참고 전략 문서

{docs_text}

위 분석 결과를 바탕으로 일반적인 헤지 방향과 고려 요소를 설명해주세요.
특정 종목명이나 개별 상품명을 직접 추천하지 말고 범주 수준에서만 제안해주세요.
상승 위험 대응이라면 상관관계만으로 결론내리지 말고, 포지션 방향과 손익 구조까지 함께 설명해주세요.
대상과 포트폴리오의 양의 상관관계가 높을 때 그 대상을 같은 방향으로 추가 편입하면 노출 확대가 될 수 있다는 점도 명시해주세요."""

    if payload.user_context and payload.user_context.strip():
        user_message += f"\n\n## 사용자 추가 요청\n\n{payload.user_context.strip()}"

    client = OpenAI(api_key=api_key)  # noqa: S106 — key from user input, not hardcoded
    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        stream=True,
        max_tokens=1200,
        temperature=0.4,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
