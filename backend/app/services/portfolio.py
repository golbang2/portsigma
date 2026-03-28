from __future__ import annotations

from io import StringIO

import pandas as pd

from app.analytics.dcc import calculate_dcc_correlation_matrix
from app.analytics.garch import calculate_garch_volatility
from app.schemas.portfolio import AnalyzePortfolioRequest, AnalyzePortfolioResponse, AssetReport
from app.services.market_data import fetch_fx_series, fetch_yahoo_prices


Z_SCORE_95_LEFT_TAIL = -1.6448536269514722


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


def serialize_time_series(frame: pd.DataFrame, round_digits: int = 6) -> list[dict[str, float | str]]:
    serializable = frame.reset_index().rename(columns={"index": "date"})
    first_column = serializable.columns[0]
    serializable[first_column] = pd.to_datetime(serializable[first_column]).dt.strftime("%Y-%m-%d")
    return serializable.round(round_digits).fillna("").to_dict(orient="records")


def serialize_correlation(frame: pd.DataFrame) -> list[dict[str, float | str]]:
    melted = frame.reset_index().rename(columns={"index": "asset"})
    return melted.round(6).fillna("").to_dict(orient="records")


def calculate_parametric_var_95(portfolio_returns: pd.Series, market_value: float) -> tuple[float | None, float | None, float | None, float | None, float | None]:
    cleaned = portfolio_returns.dropna()
    if cleaned.empty:
        return None, None, None, None, None

    mean_return = float(cleaned.mean())
    std_return = float(cleaned.std(ddof=1))
    threshold_return = mean_return + Z_SCORE_95_LEFT_TAIL * std_return
    var_return = max(0.0, -threshold_return)
    var_amount = market_value * var_return
    return var_return, var_amount, mean_return, std_return, threshold_return


def analyze_portfolio(payload: AnalyzePortfolioRequest) -> AnalyzePortfolioResponse:
    report_currency = payload.report_currency.upper()
    local_series_map: dict[str, pd.Series] = {}
    converted_series_map: dict[str, pd.Series] = {}
    asset_rows: list[dict[str, float | str]] = []
    warnings: list[str] = []

    for asset in payload.assets:
        try:
            prices, price_currency = load_asset_data(asset.source_type, asset.ticker, asset.csv_text, payload.period)
            series = prices.set_index("Date")["price"].sort_index()
            converted_series, market_fx_rate = convert_series_to_currency(
                series,
                price_currency or report_currency,
                report_currency,
                payload.period,
            )
            converted_cost_basis, purchase_fx_rate = convert_amount(
                asset.purchase_price * asset.quantity,
                asset.purchase_currency.upper(),
                report_currency,
                payload.period,
            )
            local_series_map[asset.name] = series
            converted_series_map[asset.name] = converted_series
            asset_rows.append(
                {
                    "asset": asset.name,
                    "purchase_price": asset.purchase_price,
                    "purchase_currency": asset.purchase_currency.upper(),
                    "quantity": asset.quantity,
                    "price_currency": price_currency or report_currency,
                    "cost_basis_original": asset.purchase_price * asset.quantity,
                    "cost_basis_report": converted_cost_basis,
                    "purchase_fx_rate": purchase_fx_rate,
                    "market_fx_rate": market_fx_rate,
                }
            )
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"{asset.name}: {exc}")

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
    correlation = calculate_dcc_correlation_matrix(returns).fillna(0.0)
    garch_vol = returns.apply(calculate_garch_volatility)
    weight_series = asset_frame.set_index("asset")["market_weight_report"].reindex(returns.columns).fillna(0.0)
    portfolio_returns = returns.mul(weight_series, axis=1).sum(axis=1)
    portfolio_vol = calculate_garch_volatility(portfolio_returns)
    var_95_return, var_95_amount, var_mean_return, var_std_return, var_95_cutoff_return = calculate_parametric_var_95(
        portfolio_returns,
        float(asset_frame["market_value_report"].sum()),
    )
    asset_frame["garch_volatility"] = asset_frame["asset"].map(garch_vol)

    assets = [
        AssetReport(**row)
        for row in asset_frame[
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
        report_currency=report_currency,
        period=payload.period,
        total_cost_basis_report=float(asset_frame["cost_basis_report"].sum()),
        total_market_value_report=float(asset_frame["market_value_report"].sum()),
        total_profit_loss_report=float(asset_frame["profit_loss_report"].sum()),
        portfolio_garch_volatility=portfolio_vol,
        var_95_return=var_95_return,
        var_95_amount=var_95_amount,
        var_mean_return=var_mean_return,
        var_std_return=var_std_return,
        var_95_cutoff_return=var_95_cutoff_return,
        assets=assets,
        warnings=warnings,
        normalized_prices=serialize_time_series(normalize_prices(report_prices)),
        correlation=serialize_correlation(correlation),
        garch_by_asset=garch_by_asset.to_dict(orient="records"),
        recent_daily_returns=serialize_time_series(returns.tail(60)),
    )


