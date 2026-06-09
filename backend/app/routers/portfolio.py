import os

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.schemas.portfolio import (
    AnalyzePortfolioRequest,
    AnalyzePortfolioResponse,
    OptimizePortfolioRequest,
    OptimizePortfolioResponse,
    RiskStrategyRequest,
    RiskStrategyResponse,
    StrategyRecommendRequest,
)
from app.services.kofr import get_kofr
from app.services.market_data import fetch_current_price, search_ticker
from app.services.optimize import run_portfolio_optimization
from app.services.portfolio import analyze_portfolio, analyze_risk_strategy
from app.services.strategy_recommend import stream_strategy_recommendation

router = APIRouter(tags=["portfolio"])
limiter = Limiter(key_func=get_remote_address)


@router.get("/portfolio/search-ticker")
@limiter.limit("60/minute")
def search_ticker_endpoint(request: Request, q: str = Query(min_length=1, max_length=100)) -> list[dict]:
    return search_ticker(q)


@router.get("/portfolio/ticker-price")
@limiter.limit("30/minute")
def ticker_price_endpoint(request: Request, ticker: str = Query(min_length=1, max_length=20)) -> dict:
    try:
        return fetch_current_price(ticker.strip())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/portfolio/risk-free-rate")
@limiter.limit("30/minute")
def risk_free_rate_endpoint(request: Request) -> dict:
    return {"rate": get_kofr(), "source": "KOFR"}


@router.post("/portfolio/analyze", response_model=AnalyzePortfolioResponse)
@limiter.limit("5/minute")
def analyze_portfolio_endpoint(request: Request, payload: AnalyzePortfolioRequest) -> AnalyzePortfolioResponse:
    try:
        return analyze_portfolio(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/portfolio/risk-strategy", response_model=RiskStrategyResponse)
@limiter.limit("10/minute")
def analyze_risk_strategy_endpoint(request: Request, payload: RiskStrategyRequest) -> RiskStrategyResponse:
    try:
        return analyze_risk_strategy(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/portfolio/optimize", response_model=OptimizePortfolioResponse)
@limiter.limit("5/minute")
def optimize_portfolio_endpoint(request: Request, payload: OptimizePortfolioRequest) -> OptimizePortfolioResponse:
    try:
        return run_portfolio_optimization(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/portfolio/strategy-recommend")
@limiter.limit("5/minute")
def strategy_recommend_endpoint(request: Request, payload: StrategyRecommendRequest) -> StreamingResponse:
    api_key = payload.openai_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="OpenAI API 키가 필요합니다. 키를 입력해주세요.")
    return StreamingResponse(
        stream_strategy_recommendation(payload),
        media_type="text/plain; charset=utf-8",
    )
