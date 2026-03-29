import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.portfolio import (
    AnalyzePortfolioRequest,
    AnalyzePortfolioResponse,
    RiskStrategyRequest,
    RiskStrategyResponse,
    StrategyRecommendRequest,
)
from app.services.portfolio import analyze_portfolio, analyze_risk_strategy
from app.services.strategy_recommend import stream_strategy_recommendation


router = APIRouter(tags=["portfolio"])


@router.post("/portfolio/analyze", response_model=AnalyzePortfolioResponse)
def analyze_portfolio_endpoint(payload: AnalyzePortfolioRequest) -> AnalyzePortfolioResponse:
    try:
        return analyze_portfolio(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/portfolio/risk-strategy", response_model=RiskStrategyResponse)
def analyze_risk_strategy_endpoint(payload: RiskStrategyRequest) -> RiskStrategyResponse:
    try:
        return analyze_risk_strategy(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/portfolio/strategy-recommend")
def strategy_recommend_endpoint(payload: StrategyRecommendRequest) -> StreamingResponse:
    api_key = payload.openai_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API 키가 필요합니다. 키를 입력해주세요.")
    return StreamingResponse(
        stream_strategy_recommendation(payload),
        media_type="text/plain; charset=utf-8",
    )
