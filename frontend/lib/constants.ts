export const REPORT_CURRENCIES = ["USD", "EUR", "JPY", "GBP", "CHF", "CAD", "AUD", "CNY", "HKD", "SGD", "KRW"];
export const HISTORY_PERIODS = ["1y", "3y", "5y", "10y", "max"] as const;
export const MAJOR_INDEX_OPTIONS = [
  { id: "sp500", label: "S&P 500" },
  { id: "nasdaq100", label: "NASDAQ 100" },
  { id: "nikkei225", label: "Nikkei 225" },
  { id: "ftse100", label: "FTSE 100" },
  { id: "dax", label: "DAX" },
  { id: "cac40", label: "CAC 40" },
  { id: "kospi", label: "KOSPI" }
] as const;
export const DEFAULT_PRICE_CSV = `Date,Close
2025-01-02,100
2025-01-03,102.5
2025-01-06,101.8`;
