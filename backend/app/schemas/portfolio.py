from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


SupportedPeriod = Literal["1y", "3y", "5y", "10y", "max"]
PriceSource = Literal["yahoo_finance", "csv"]
RiskFactorType = Literal["major_index", "asset_fx", "asset"]
RiskDirection = Literal["up", "down"]


class AssetInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    source_type: PriceSource
    ticker: str = Field(default="", max_length=20)
    purchase_price: float = Field(ge=0)
    purchase_currency: str = Field(min_length=3, max_length=3)
    quantity: float = Field(gt=0)
    csv_text: str = Field(default="", max_length=50_000)


class AnalyzePortfolioRequest(BaseModel):
    portfolio_name: str = Field(default="My Portfolio", max_length=100)
    report_currency: str = Field(min_length=3, max_length=3)
    period: SupportedPeriod = "5y"
    assets: list[AssetInput] = Field(min_length=1, max_length=10)


class RiskStrategyRequest(BaseModel):
    portfolio_name: str = Field(default="My Portfolio", max_length=100)
    report_currency: str = Field(min_length=3, max_length=3)
    period: SupportedPeriod = "5y"
    assets: list[AssetInput] = Field(min_length=1, max_length=10)
    factor_type: RiskFactorType
    factor_id: str = Field(min_length=1)
    factor_label: str = Field(min_length=1)
    direction: RiskDirection


class AssetReport(BaseModel):
    asset: str
    purchase_price: float
    purchase_currency: str
    quantity: float
    price_currency: str
    cost_basis_original: float
    cost_basis_report: float
    latest_price_original: float
    latest_price_report: float
    market_value_original: float
    market_value_report: float
    profit_loss_report: float
    purchase_fx_rate: float
    market_fx_rate: float
    cost_weight_report: float
    market_weight_report: float
    garch_volatility: float | None = None


class AnalyzePortfolioResponse(BaseModel):
    portfolio_name: str
    report_currency: str
    period: SupportedPeriod
    total_cost_basis_report: float
    total_market_value_report: float
    total_profit_loss_report: float
    portfolio_garch_volatility: float | None = None
    var_95_return: float | None = None
    var_95_amount: float | None = None
    var_95_confidence: float = 0.95
    var_95_tail_probability: float = 0.05
    var_mean_return: float | None = None
    var_std_return: float | None = None
    var_95_cutoff_return: float | None = None
    assets: list[AssetReport]
    warnings: list[str]
    normalized_prices: list[dict[str, float | str]]
    correlation: list[dict[str, float | str]]
    garch_by_asset: list[dict[str, float | str]]
    recent_daily_returns: list[dict[str, float | str]]
    portfolio_volatility_series: list[dict[str, float | str]]
    max_drawdown_series: list[dict[str, float | str]]
    max_drawdown: float | None = None


class RiskStrategyResponse(BaseModel):
    portfolio_name: str
    report_currency: str
    period: SupportedPeriod
    factor_type: RiskFactorType
    factor_id: str
    factor_label: str
    direction: RiskDirection
    correlation: float | None = None
    beta: float | None = None
    hedge_ratio: float | None = None
    portfolio_volatility: float | None = None
    factor_volatility: float | None = None
    warnings: list[str]


class StrategyRecommendRequest(BaseModel):
    portfolio_name: str = "My Portfolio"
    report_currency: str = Field(min_length=3, max_length=3)
    factor_label: str = Field(min_length=1)
    direction: RiskDirection
    correlation: float | None = None
    beta: float | None = None
    hedge_ratio: float | None = None
    portfolio_volatility: float | None = None
    factor_volatility: float | None = None
    openai_api_key: str | None = None
