from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from io import StringIO

import pandas as pd

from app.analytics.dcc import calculate_dcc_correlation_matrix
from app.analytics.garch import calculate_garch_volatility, calculate_garch_volatility_series
from app.schemas.portfolio import (
    AnalyzePortfolioRequest,
    AnalyzePortfolioResponse,
    AssetReport,
    RiskStrategyRequest,
    RiskStrategyResponse,
)
from app.services.market_data import fetch_fx_series, fetch_yahoo_prices


Z_SCORE_95_LEFT_TAIL = -1.6448536269514722
MAJOR_INDEX_FACTORS: dict[str, tuple[str, str]] = {
    "sp500": ("S&P 500", "^GSPC"),
    "nasdaq100": ("NASDAQ 100", "^NDX"),
    "nikkei225": ("Nikkei 225", "^N225"),
    "ftse100": ("FTSE 100", "^FTSE"),
    "dax": ("DAX", "^GDAXI"),
    "cac40": ("CAC 40", "^FCHI"),
    "kospi": ("KOSPI", "^KS11"),
}


@dataclass
class PortfolioContext:
    report_currency: str
    asset_frame: pd.DataFrame
    report_prices: pd.DataFrame
    returns: pd.DataFrame
    portfolio_returns: pd.Series
    warnings: list[str]


def parse_asset_price_csv(csv_text: str) -> pd.DataFrame:
    frame = pd.read_csv(StringIO(csv_text))
    required_columns = {"Date", "Close"}
    missing = required_columns - set(frame.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")

    prices = frame[["Date", "Close"]].copy()
    prices["Date"] = pd.to_datetime(prices["Date"])
    prices["price"] = pd.to_numeric(prices["Close"], errors="coerce")
    prices = prices.drop(columns=["Close"]).dropna(subset=["Date", "price"])
    if prices.empty:
        raise ValueError("No valid price rows were found in the CSV data.")
    return prices.sort_values("Date").drop_duplicates(subset="Date", keep="last")


def load_asset_data(source_type: str, ticker: str, csv_text: str, period: str) -> tuple[pd.DataFrame, str]:
    if source_type == "yahoo_finance":
        prices, detected_currency = fetch_yahoo_prices(ticker.strip(), period)
        return prices, (detected_currency or "USD").upper()
    return parse_asset_price_csv(csv_text), ""


def convert_series_to_currency(
    series: pd.Series, from_currency: str, to_currency: str, period: str
) -> tuple[pd.Series, float]:
    if from_currency == to_currency:
        return series.sort_index(), 1.0

    fx_series = fetch_fx_series(from_currency, to_currency, period)
    aligned_index = series.index.union(fx_series.index)
    converted = (
        series.sort_index().reindex(aligned_index).ffill()
        * fx_series.sort_index().reindex(aligned_index).ffill()
    )
    latest_fx = float(fx_series.dropna().iloc[-1])
    return converted.reindex(series.index).ffill().dropna(), latest_fx


def convert_amount(amount: float, from_currency: str, to_currency: str, period: str) -> tuple[float, float]:
    if from_currency == to_currency:
        return amount, 1.0
    fx_series = fetch_fx_series(from_currency, to_currency, period)
    latest_fx = float(fx_series.dropna().iloc[-1])
    return amount * latest_fx, latest_fx


def normalize_prices(price_matrix: pd.DataFrame) -> pd.DataFrame:
    return price_matrix.apply(lambda col: col / col.dropna().iloc[0] if col.dropna().any() else col)


def build_drawdown_series(portfolio_returns: pd.Series) -> tuple[pd.DataFrame, float | None]:
    cleaned = portfolio_returns.dropna()
    if cleaned.empty:
        return pd.DataFrame(columns=["drawdown"]), None

    cumulative = (1 + cleaned).cumprod()
    running_peak = cumulative.cummax()
    drawdown = cumulative / running_peak - 1
    frame = drawdown.to_frame(name="drawdown")
    max_drawdown = float(drawdown.min()) if not drawdown.empty else None
    return frame, max_drawdown


def serialize_time_series(frame: pd.DataFrame, round_digits: int = 6) -> list[dict[str, float | str]]:
    serializable = frame.reset_index()
    first_column = serializable.columns[0]
    serializable = serializable.rename(columns={first_column: "date"})
    serializable["date"] = pd.to_datetime(serializable["date"]).dt.strftime("%Y-%m-%d")
    return serializable.round(round_digits).fillna("").to_dict(orient="records")


def serialize_correlation(frame: pd.DataFrame) -> list[dict[str, float | str]]:
    melted = frame.reset_index().rename(columns={"index": "asset"})
    return melted.round(6).fillna("").to_dict(orient="records")


def calculate_parametric_var_95(
    portfolio_returns: pd.Series, market_value: float
) -> tuple[float | None, float | None, float | None, float | None, float | None]:
    cleaned = portfolio_returns.dropna()
    if cleaned.empty:
        return None, None, None, None, None

    mean_return = float(cleaned.mean())
    std_return = float(cleaned.std(ddof=1))
    threshold_return = mean_return + Z_SCORE_95_LEFT_TAIL * std_return
    var_return = max(0.0, -threshold_return)
    var_amount = market_value * var_return
    return var_return, var_amount, mean_return, std_return, threshold_return


def _fetch_asset(
    asset,
    report_currency: str,
    period: str,
) -> tuple[dict | None, str | None]:
    """Fetch and process a single asset. Returns (result, warning) — one is always None."""
    try:
        prices, price_currency = load_asset_data(asset.source_type, asset.ticker, asset.csv_text, period)
        series = prices.set_index("Date")["price"].sort_index()
        effective_price_currency = (price_currency or report_currency).upper()
        converted_series, market_fx_rate = convert_series_to_currency(
            series,
            effective_price_currency,
            report_currency,
            period,
        )
        converted_cost_basis, purchase_fx_rate = convert_amount(
            asset.purchase_price * asset.quantity,
            asset.purchase_currency.upper(),
            report_currency,
            period,
        )
        return {
            "name": asset.name,
            "series": series,
            "converted_series": converted_series,
            "row": {
                "asset": asset.name,
                "purchase_price": asset.purchase_price,
                "purchase_currency": asset.purchase_currency.upper(),
                "quantity": asset.quantity,
                "price_currency": effective_price_currency,
                "cost_basis_original": asset.purchase_price * asset.quantity,
                "cost_basis_report": converted_cost_basis,
                "purchase_fx_rate": purchase_fx_rate,
                "market_fx_rate": market_fx_rate,
            },
        }, None
    except Exception as exc:  # noqa: BLE001
        return None, f"{asset.name}: {exc}"


def build_portfolio_context(payload: AnalyzePortfolioRequest | RiskStrategyRequest) -> PortfolioContext:
    report_currency = payload.report_currency.upper()
    local_series_map: dict[str, pd.Series] = {}
    converted_series_map: dict[str, pd.Series] = {}
    asset_rows: list[dict[str, float | str]] = []
    warnings: list[str] = []

    # Fetch all assets in parallel to avoid sequential Yahoo Finance latency on Render.
    # Results are collected in submission order to preserve asset ordering.
    max_workers = min(len(payload.assets), 8)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(_fetch_asset, asset, report_currency, payload.period)
            for asset in payload.assets
        ]
        fetch_results = [f.result() for f in futures]

    for result, warning in fetch_results:
        if warning is not None:
            warnings.append(warning)
        else:
            local_series_map[result["name"]] = result["series"]
            converted_series_map[result["name"]] = result["converted_series"]
            asset_rows.append(result["row"])

    if not asset_rows or not converted_series_map:
        raise ValueError("No analyzable asset price data is available.")

    local_prices = pd.concat(local_series_map, axis=1).sort_index().ffill().dropna(how="all")
    report_prices = pd.concat(converted_series_map, axis=1).sort_index().ffill().dropna(how="all")

    asset_frame = pd.DataFrame(asset_rows)
    latest_local_prices = local_prices.ffill().iloc[-1].rename("latest_price_original")
    latest_report_prices = report_prices.ffill().iloc[-1].rename("latest_price_report")
    asset_frame = asset_frame.merge(latest_local_prices, left_on="asset", right_index=True, how="left")
    asset_frame = asset_frame.merge(latest_report_prices, left_on="asset", right_index=True, how="left")

    asset_frame["market_value_original"] = asset_frame["latest_price_original"] * asset_frame["quantity"]
    asset_frame["market_value_report"] = asset_frame["latest_price_report"] * asset_frame["quantity"]
    asset_frame["profit_loss_report"] = asset_frame["market_value_report"] - asset_frame["cost_basis_report"]
    asset_frame["cost_weight_report"] = asset_frame["cost_basis_report"] / asset_frame["cost_basis_report"].sum()
    asset_frame["market_weight_report"] = asset_frame["market_value_report"] / asset_frame["market_value_report"].sum()

    returns = report_prices.pct_change().dropna(how="all")
    weight_series = asset_frame.set_index("asset")["market_weight_report"].reindex(returns.columns).fillna(0.0)
    portfolio_returns = returns.mul(weight_series, axis=1).sum(axis=1)

    return PortfolioContext(
        report_currency=report_currency,
        asset_frame=asset_frame,
        report_prices=report_prices,
        returns=returns,
        portfolio_returns=portfolio_returns,
        warnings=warnings,
    )


def build_factor_series(payload: RiskStrategyRequest, context: PortfolioContext) -> pd.Series:
    if payload.factor_type == "asset":
        if payload.factor_id not in context.report_prices.columns:
            raise ValueError("Selected asset factor could not be found in the analyzed portfolio.")
        return context.report_prices[payload.factor_id].sort_index()

    if payload.factor_type == "asset_fx":
        asset_rows = context.asset_frame.loc[context.asset_frame["asset"] == payload.factor_id]
        if asset_rows.empty:
            raise ValueError("Selected FX factor asset could not be found in the analyzed portfolio.")
        price_currency = str(asset_rows.iloc[0]["price_currency"]).upper()
        if price_currency == context.report_currency:
            raise ValueError("Selected asset is already priced in the report currency, so there is no separate FX factor.")
        return fetch_fx_series(price_currency, context.report_currency, payload.period).sort_index()

    if payload.factor_type == "major_index":
        if payload.factor_id not in MAJOR_INDEX_FACTORS:
            raise ValueError("Selected major index factor is not supported.")
        _, ticker = MAJOR_INDEX_FACTORS[payload.factor_id]
        prices, price_currency = fetch_yahoo_prices(ticker, payload.period)
        series = prices.set_index("Date")["price"].sort_index()
        converted_series, _ = convert_series_to_currency(series, (price_currency or "USD").upper(), context.report_currency, payload.period)
        return converted_series

    raise ValueError("Unsupported risk factor type.")


def calculate_factor_statistics(
    portfolio_returns: pd.Series, factor_returns: pd.Series
) -> tuple[float | None, float | None, float | None, float | None, float | None]:
    aligned = pd.concat(
        [portfolio_returns.rename("portfolio"), factor_returns.rename("factor")],
        axis=1,
        join="inner",
    ).dropna()
    if len(aligned) < 60:
        raise ValueError("Risk strategy analysis needs at least 60 overlapping return observations.")

    correlation_frame = calculate_dcc_correlation_matrix(aligned)
    correlation = float(correlation_frame.loc["portfolio", "factor"])

    portfolio_volatility = float(aligned["portfolio"].std(ddof=1))
    factor_volatility = float(aligned["factor"].std(ddof=1))
    factor_variance = float(aligned["factor"].var(ddof=1))
    if factor_variance == 0 or factor_volatility == 0:
        raise ValueError("Selected factor has zero variance, so beta and hedge ratio cannot be calculated.")

    covariance = float(aligned[["portfolio", "factor"]].cov().loc["portfolio", "factor"])
    beta = covariance / factor_variance
    hedge_ratio = beta * (portfolio_volatility / factor_volatility)
    return correlation, beta, hedge_ratio, portfolio_volatility, factor_volatility


def analyze_portfolio(payload: AnalyzePortfolioRequest) -> AnalyzePortfolioResponse:
    context = build_portfolio_context(payload)

    correlation = calculate_dcc_correlation_matrix(context.returns).fillna(0.0)
    garch_vol = context.returns.apply(calculate_garch_volatility)
    portfolio_vol = calculate_garch_volatility(context.portfolio_returns)
    portfolio_volatility_series = calculate_garch_volatility_series(context.portfolio_returns).to_frame(name="portfolio_volatility")
    var_95_return, var_95_amount, var_mean_return, var_std_return, var_95_cutoff_return = calculate_parametric_var_95(
        context.portfolio_returns,
        float(context.asset_frame["market_value_report"].sum()),
    )
    drawdown_series, max_drawdown = build_drawdown_series(context.portfolio_returns)
    context.asset_frame["garch_volatility"] = context.asset_frame["asset"].map(garch_vol)

    assets = [
        AssetReport(**row)
        for row in context.asset_frame[
            [
                "asset",
                "purchase_price",
                "purchase_currency",
                "quantity",
                "price_currency",
                "cost_basis_original",
                "cost_basis_report",
                "latest_price_original",
                "latest_price_report",
                "market_value_original",
                "market_value_report",
                "profit_loss_report",
                "purchase_fx_rate",
                "market_fx_rate",
                "cost_weight_report",
                "market_weight_report",
                "garch_volatility",
            ]
        ].to_dict(orient="records")
    ]

    garch_by_asset = pd.DataFrame({"asset": garch_vol.index, "garch_volatility": garch_vol.values}).fillna("")

    return AnalyzePortfolioResponse(
        portfolio_name=payload.portfolio_name,
        report_currency=context.report_currency,
        period=payload.period,
        total_cost_basis_report=float(context.asset_frame["cost_basis_report"].sum()),
        total_market_value_report=float(context.asset_frame["market_value_report"].sum()),
        total_profit_loss_report=float(context.asset_frame["profit_loss_report"].sum()),
        portfolio_garch_volatility=portfolio_vol,
        var_95_return=var_95_return,
        var_95_amount=var_95_amount,
        var_mean_return=var_mean_return,
        var_std_return=var_std_return,
        var_95_cutoff_return=var_95_cutoff_return,
        assets=assets,
        warnings=context.warnings,
        normalized_prices=serialize_time_series(normalize_prices(context.report_prices)),
        correlation=serialize_correlation(correlation),
        garch_by_asset=garch_by_asset.to_dict(orient="records"),
        recent_daily_returns=serialize_time_series(context.returns.tail(60)),
        portfolio_volatility_series=serialize_time_series(portfolio_volatility_series),
        max_drawdown_series=serialize_time_series(drawdown_series),
        max_drawdown=max_drawdown,
    )


def analyze_risk_strategy(payload: RiskStrategyRequest) -> RiskStrategyResponse:
    context = build_portfolio_context(payload)
    factor_series = build_factor_series(payload, context)
    factor_returns = factor_series.pct_change().dropna()
    correlation, beta, hedge_ratio, portfolio_volatility, factor_volatility = calculate_factor_statistics(
        context.portfolio_returns,
        factor_returns,
    )

    return RiskStrategyResponse(
        portfolio_name=payload.portfolio_name,
        report_currency=context.report_currency,
        period=payload.period,
        factor_type=payload.factor_type,
        factor_id=payload.factor_id,
        factor_label=payload.factor_label,
        direction=payload.direction,
        correlation=correlation,
        beta=beta,
        hedge_ratio=hedge_ratio,
        portfolio_volatility=portfolio_volatility,
        factor_volatility=factor_volatility,
        warnings=context.warnings,
    )

