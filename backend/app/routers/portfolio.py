from fastapi import APIRouter, HTTPException

from app.schemas.portfolio import (
    AnalyzePortfolioRequest,
    AnalyzePortfolioResponse,
    RiskStrategyRequest,
    RiskStrategyResponse,
)
from app.services.portfolio import analyze_portfolio, analyze_risk_strategy


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
