from __future__ import annotations

import os
from collections.abc import Iterator

from openai import OpenAI

from app.rag.engine import retrieve
from app.schemas.portfolio import StrategyRecommendRequest

SYSTEM_PROMPT = """당신은 포트폴리오 리스크 관리 전문가입니다.
사용자의 포트폴리오 분석 결과와 참고 전략 문서를 바탕으로 실용적인 헤지 전략을 한국어로 추천해주세요.

다음 형식으로 답변해주세요:
1. 현재 상황 요약 (2-3문장)
2. 추천 헤지 전략 (구체적인 수단과 비율 포함)
3. 실행 방법 (단계별)
4. 주의사항

전문 용어는 괄호 안에 한글 설명을 추가하고, 구체적인 ETF 종목이나 수단을 제시해주세요."""


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

위 분석 결과를 바탕으로 구체적이고 실행 가능한 헤지 전략을 추천해주세요."""

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
