import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

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
limiter = Limiter(key_func=get_remote_address)


@router.post("/portfolio/analyze", response_model=AnalyzePortfolioResponse)
@limiter.limit("10/minute")
def analyze_portfolio_endpoint(request: Request, payload: AnalyzePortfolioRequest) -> AnalyzePortfolioResponse:
    try:
        return analyze_portfolio(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/portfolio/risk-strategy", response_model=RiskStrategyResponse)
@limiter.limit("20/minute")
def analyze_risk_strategy_endpoint(request: Request, payload: RiskStrategyRequest) -> RiskStrategyResponse:
    try:
        return analyze_risk_strategy(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/portfolio/strategy-recommend")
@limiter.limit("10/minute")
def strategy_recommend_endpoint(request: Request, payload: StrategyRecommendRequest) -> StreamingResponse:
    api_key = payload.openai_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API 키가 필요합니다. 키를 입력해주세요.")
    return StreamingResponse(
        stream_strategy_recommendation(payload),
        media_type="text/plain; charset=utf-8",
    )
