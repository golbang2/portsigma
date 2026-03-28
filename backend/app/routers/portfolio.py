from fastapi import APIRouter, HTTPException

from app.schemas.portfolio import AnalyzePortfolioRequest, AnalyzePortfolioResponse
from app.services.portfolio import analyze_portfolio


router = APIRouter(tags=["portfolio"])


@router.post("/portfolio/analyze", response_model=AnalyzePortfolioResponse)
def analyze_portfolio_endpoint(payload: AnalyzePortfolioRequest) -> AnalyzePortfolioResponse:
    try:
        return analyze_portfolio(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
