export type PriceSource = "yahoo_finance" | "csv";
export type HistoryPeriod = "1y" | "3y" | "5y" | "10y" | "max";

export type AssetDraft = {
  id: string;
  name: string;
  source_type: PriceSource;
  ticker: string;
  purchase_price: number;
  purchase_currency: string;
  quantity: number;
  csv_text: string;
};

export type AnalyzeRequest = {
  portfolio_name: string;
  report_currency: string;
  period: HistoryPeriod;
  assets: Omit<AssetDraft, "id">[];
};

export type AssetReport = {
  asset: string;
  purchase_price: number;
  purchase_currency: string;
  quantity: number;
  price_currency: string;
  cost_basis_original: number;
  cost_basis_report: number;
  latest_price_original: number;
  latest_price_report: number;
  market_value_original: number;
  market_value_report: number;
  profit_loss_report: number;
  purchase_fx_rate: number;
  market_fx_rate: number;
  cost_weight_report: number;
  market_weight_report: number;
  garch_volatility: number | null;
};

export type AnalyzeResponse = {
  portfolio_name: string;
  report_currency: string;
  period: HistoryPeriod;
  total_cost_basis_report: number;
  total_market_value_report: number;
  total_profit_loss_report: number;
  portfolio_garch_volatility: number | null;
  var_95_return: number | null;
  var_95_amount: number | null;
  var_95_confidence: number;
  var_95_tail_probability: number;
  var_mean_return: number | null;
  var_std_return: number | null;
  var_95_cutoff_return: number | null;
  assets: AssetReport[];
  warnings: string[];
  normalized_prices: Array<Record<string, string | number>>;
  correlation: Array<Record<string, string | number>>;
  garch_by_asset: Array<Record<string, string | number>>;
  recent_daily_returns: Array<Record<string, string | number>>;
};
