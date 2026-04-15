"use client";

import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import ReactMarkdown from "react-markdown";

import { AssetEditor } from "@/components/AssetEditor";
import { MetricCard } from "@/components/MetricCard";
import { analyzePortfolio, analyzeRiskStrategy, streamStrategyRecommendation, warmupBackend } from "@/lib/api";
import { useLang } from "@/lib/language-context";
import { DEFAULT_PRICE_CSV, HISTORY_PERIODS, MAJOR_INDEX_OPTIONS, REPORT_CURRENCIES } from "@/lib/constants";
import { assetsToPortfolioCsv, parsePortfolioCsv } from "@/lib/portfolio-csv";
import type {
  AnalyzeResponse,
  AssetDraft,
  HistoryPeriod,
  RiskDirection,
  RiskFactorType,
  RiskStrategyResponse,
  StrategyRecommendRequest
} from "@/lib/types";

type RiskFactorOption = {
  value: string;
  factorType: RiskFactorType;
  factorId: string;
  label: string;
};

function createAsset(index: number): AssetDraft {
  return {
    id: `${Date.now()}-${index}`,
    name: `Asset ${index + 1}`,
    source_type: "yahoo_finance",
    ticker: "",
    purchase_price: 100,
    purchase_currency: "KRW",
    quantity: 1,
    csv_text: DEFAULT_PRICE_CSV
  };
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatSignedNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(digits);
}

function correlationCellStyle(value: number | string): React.CSSProperties {
  if (typeof value !== "number") return {};
  const v = Math.max(-1, Math.min(1, value));
  if (v > 0) {
    // white → #0f766e (teal-700)
    const t = v;
    const r = Math.round(255 + t * (15 - 255));
    const g = Math.round(255 + t * (118 - 255));
    const b = Math.round(255 + t * (110 - 255));
    return {
      backgroundColor: `rgb(${r},${g},${b})`,
      color: t > 0.5 ? "#ffffff" : "#134e4a",
      fontWeight: t > 0.5 ? 600 : 400,
    };
  }
  if (v < 0) {
    // white → #dc2626 (red-600)
    const t = -v;
    const r = Math.round(255 + t * (220 - 255));
    const g = Math.round(255 + t * (38 - 255));
    const b = Math.round(255 + t * (38 - 255));
    return {
      backgroundColor: `rgb(${r},${g},${b})`,
      color: t > 0.5 ? "#ffffff" : "#7f1d1d",
      fontWeight: t > 0.5 ? 600 : 400,
    };
  }
  return { color: "#94a3b8" };
}

function buildNormalCurveData(mean: number | null, std: number | null, cutoff: number | null) {
  if (mean === null || std === null || cutoff === null || std <= 0) {
    return [] as Array<{ x: number; density: number; tailDensity: number | null }>;
  }

  const min = mean - 4 * std;
  const max = mean + 4 * std;
  const step = (max - min) / 120;
  const denominator = std * Math.sqrt(2 * Math.PI);

  return Array.from({ length: 121 }, (_, index) => {
    const x = min + step * index;
    const density = Math.exp(-((x - mean) ** 2) / (2 * std ** 2)) / denominator;
    return {
      x,
      density,
      tailDensity: x <= cutoff ? density : null
    };
  });
}

const PIE_COLORS = ["#f97316", "#0f766e", "#0284c7", "#dc2626", "#7c3aed", "#ca8a04", "#14b8a6"];

function VolatilityTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-300 text-[11px] font-bold text-white hover:bg-slate-400 focus:outline-none"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label={text}
      >
        i
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-xl bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          {text}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { t, toggleLang } = useLang();
  const [portfolioName, setPortfolioName] = useState("My Portfolio");
  const [reportCurrency, setReportCurrency] = useState("KRW");
  const [period, setPeriod] = useState<HistoryPeriod>("5y");
  const [assets, setAssets] = useState<AssetDraft[]>([createAsset(0), createAsset(1), createAsset(2)]);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRiskFactorValue, setSelectedRiskFactorValue] = useState("");
  const [riskDirection, setRiskDirection] = useState<RiskDirection>("down");
  const [riskResult, setRiskResult] = useState<RiskStrategyResponse | null>(null);
  const [riskErrorMessage, setRiskErrorMessage] = useState("");
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [recommendation, setRecommendation] = useState("");
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState("");
  const [userContext, setUserContext] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    warmupBackend().then(setBackendReady);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("openai_api_key");
    if (saved) setOpenaiApiKey(saved);
  }, []);

  // Restore draft from localStorage on first load
  useEffect(() => {
    try {
      const raw = localStorage.getItem("portsigma_draft");
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.portfolioName) setPortfolioName(draft.portfolioName);
        if (draft.reportCurrency) setReportCurrency(draft.reportCurrency);
        if (draft.period) setPeriod(draft.period);
        if (Array.isArray(draft.assets) && draft.assets.length > 0) setAssets(draft.assets);
      }
    } catch {
      // corrupted storage — ignore
    }
    draftLoadedRef.current = true;
  }, []);

  // Auto-save draft to localStorage whenever inputs change
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    try {
      localStorage.setItem("portsigma_draft", JSON.stringify({ portfolioName, reportCurrency, period, assets }));
    } catch {
      // storage quota exceeded — ignore
    }
  }, [portfolioName, reportCurrency, period, assets]);

  function handleApiKeyChange(value: string) {
    setOpenaiApiKey(value);
    if (value) {
      sessionStorage.setItem("openai_api_key", value);
    } else {
      sessionStorage.removeItem("openai_api_key");
    }
  }

  function resetRiskAnalysis() {
    setRiskResult(null);
    setRiskErrorMessage("");
    setRecommendation("");
    setRecommendError("");
  }

  async function handleRecommend() {
    if (!riskResult || !selectedRiskFactor) return;
    setIsRecommending(true);
    setRecommendation("");
    setRecommendError("");
    const payload: StrategyRecommendRequest = {
      portfolio_name: portfolioName,
      report_currency: reportCurrency,
      factor_label: riskResult.factor_label,
      direction: riskResult.direction,
      correlation: riskResult.correlation,
      beta: riskResult.beta,
      hedge_ratio: riskResult.hedge_ratio,
      portfolio_volatility: riskResult.portfolio_volatility,
      factor_volatility: riskResult.factor_volatility,
      openai_api_key: openaiApiKey || undefined,
      user_context: userContext.trim() || undefined,
    };
    try {
      let received = false;
      await streamStrategyRecommendation(payload, (chunk) => {
        received = true;
        setRecommendation((prev) => prev + chunk);
      });
      if (!received) {
        setRecommendError(t.errNoResponse);
      }
    } catch (error) {
      setRecommendError(error instanceof Error ? error.message : t.errRecommend);
    } finally {
      setIsRecommending(false);
    }
  }

  async function handleAnalyze() {
    setIsLoading(true);
    setErrorMessage("");
    resetRiskAnalysis();
    try {
      const response = await analyzePortfolio({
        portfolio_name: portfolioName,
        report_currency: reportCurrency,
        period,
        assets: assets.map(({ id, ...asset }, i) => ({ ...asset, name: `Asset ${i + 1}` }))
      });
      setResult(response);
      setWarnings(response.warnings);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.errAnalyze);
    } finally {
      setIsLoading(false);
    }
  }

  function updateAsset(nextAsset: AssetDraft) {
    resetRiskAnalysis();
    setAssets((current) => current.map((asset) => (asset.id === nextAsset.id ? nextAsset : asset)));
  }

  function addAsset() {
    resetRiskAnalysis();
    setAssets((current) => [...current, createAsset(current.length)]);
  }

  function removeAsset(id: string) {
    resetRiskAnalysis();
    setAssets((current) => (current.length > 1 ? current.filter((asset) => asset.id !== id) : current));
  }

  function resetDraft() {
    const fresh = [createAsset(0), createAsset(1), createAsset(2)];
    setPortfolioName("My Portfolio");
    setReportCurrency("KRW");
    setPeriod("5y");
    setAssets(fresh);
    setResult(null);
    setWarnings([]);
    setErrorMessage("");
    resetRiskAnalysis();
    try { localStorage.removeItem("portsigma_draft"); } catch { /* ignore */ }
  }

  function downloadPortfolioCsv() {
    const blob = new Blob([assetsToPortfolioCsv(assets)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${portfolioName || "portfolio"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handlePortfolioUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsedAssets = parsePortfolioCsv(text);
      setAssets(parsedAssets);
      setPortfolioName(file.name.replace(/\.csv$/i, ""));
      setErrorMessage("");
      resetRiskAnalysis();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t.errLoadCsv);
    } finally {
      if (uploadRef.current) {
        uploadRef.current.value = "";
      }
    }
  }

  const pieData =
    result?.assets.map((asset) => ({
      name: asset.asset,
      value: asset.market_value_report
    })) ?? [];

  const normalCurveData = useMemo(
    () => buildNormalCurveData(result?.var_mean_return ?? null, result?.var_std_return ?? null, result?.var_95_cutoff_return ?? null),
    [result?.var_mean_return, result?.var_std_return, result?.var_95_cutoff_return]
  );

  const portfolioVolatilitySeries = result?.portfolio_volatility_series ?? [];
  const maxDrawdownSeries = result?.max_drawdown_series ?? [];

  const normalizedPricesForChart = useMemo(
    () =>
      (result?.normalized_prices ?? []).map((row) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          out[k] = v === "" || v === 0 ? null : v;
        }
        return out;
      }),
    [result?.normalized_prices]
  );

  const riskFactorOptions = useMemo<RiskFactorOption[]>(() => {
    if (!result) {
      return [];
    }

    const majorIndexOptions = MAJOR_INDEX_OPTIONS.map((item) => ({
      value: `major_index:${item.id}`,
      factorType: "major_index" as const,
      factorId: item.id,
      label: item.label
    }));

    const assetFxOptions = result.assets
      .filter((asset) => asset.price_currency.toUpperCase() !== result.report_currency.toUpperCase())
      .map((asset) => ({
        value: `asset_fx:${asset.asset}`,
        factorType: "asset_fx" as const,
        factorId: asset.asset,
        label: `${asset.asset} ${t.fxRate} (${asset.price_currency}/${result.report_currency})`
      }));

    const assetOptions = result.assets.map((asset) => ({
      value: `asset:${asset.asset}`,
      factorType: "asset" as const,
      factorId: asset.asset,
      label: asset.asset
    }));

    return [...majorIndexOptions, ...assetFxOptions, ...assetOptions];
  }, [result]);

  const selectedRiskFactor = useMemo(
    () => riskFactorOptions.find((option) => option.value === selectedRiskFactorValue) ?? null,
    [riskFactorOptions, selectedRiskFactorValue]
  );

  useEffect(() => {
    if (riskFactorOptions.length === 0) {
      setSelectedRiskFactorValue("");
      return;
    }

    if (!riskFactorOptions.some((option) => option.value === selectedRiskFactorValue)) {
      setSelectedRiskFactorValue(riskFactorOptions[0].value);
    }
  }, [riskFactorOptions, selectedRiskFactorValue]);

  async function handleRiskStrategyAnalyze() {
    if (!result || !selectedRiskFactor) {
      return;
    }

    setIsRiskLoading(true);
    setRiskErrorMessage("");
    try {
      const response = await analyzeRiskStrategy({
        portfolio_name: portfolioName,
        report_currency: reportCurrency,
        period,
        assets: assets.map(({ id, ...asset }, i) => ({ ...asset, name: `Asset ${i + 1}` })),
        factor_type: selectedRiskFactor.factorType,
        factor_id: selectedRiskFactor.factorId,
        factor_label: selectedRiskFactor.label,
        direction: riskDirection
      });
      setRiskResult(response);
    } catch (error) {
      setRiskErrorMessage(error instanceof Error ? error.message : t.errRiskAnalyze);
    } finally {
      setIsRiskLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-panel backdrop-blur sm:rounded-[36px] sm:p-8">
        {/* 히어로 */}
        <div className="border-b border-slate-100 pb-5 sm:pb-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-ember">Portsigma</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight text-ink sm:text-4xl md:text-5xl">
                {t.heroTitle}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">
                {t.heroDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleLang}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-ember hover:text-ember"
            >
              {t.langToggle}
            </button>
          </div>
          {backendReady === null && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              {t.serverStarting}
            </div>
          )}
          {backendReady === false && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              {t.serverSlow}
            </div>
          )}
        </div>

        {/* 설정 */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            {t.portfolioName}
            <input
              value={portfolioName}
              onChange={(event) => {
                setPortfolioName(event.target.value);
                resetRiskAnalysis();
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-ember"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            {t.reportCurrency}
            <select
              value={reportCurrency}
              onChange={(event) => {
                setReportCurrency(event.target.value);
                resetRiskAnalysis();
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-ember"
            >
              {REPORT_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            {t.period}
            <select
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value as HistoryPeriod);
                resetRiskAnalysis();
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-ember"
            >
              {HISTORY_PERIODS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="hidden flex-col gap-1.5 text-xs font-medium text-slate-500 sm:flex">
            {t.loadCsv}
            <input
              ref={uploadRef}
              type="file"
              accept=".csv"
              onChange={handlePortfolioUpload}
              className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
            />
          </label>
        </div>

        {/* 액션 버튼 */}
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5">
          <button
            type="button"
            onClick={addAsset}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            {t.addAsset}
          </button>
          <button
            type="button"
            onClick={resetDraft}
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-500 transition hover:border-red-300 hover:text-red-500"
          >
            {t.reset}
          </button>
          <button
            type="button"
            onClick={downloadPortfolioCsv}
            className="hidden rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-ember hover:text-ember sm:inline-flex"
          >
            {t.saveCsv}
          </button>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isLoading}
            className="ml-auto rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? t.analyzing : t.runAnalysis}
          </button>
        </div>
      </section>

      <section className="mt-8 grid gap-5">
        {assets.map((asset, index) => (
          <AssetEditor
            key={asset.id}
            asset={asset}
            index={index}
            hideCsv={isMobile}
            onChange={updateAsset}
            onRemove={() => removeAsset(asset.id)}
          />
        ))}
      </section>

      {errorMessage ? <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">{errorMessage}</div> : null}

      {warnings.length > 0 ? (
        <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {result ? (
        <>
          <section className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label={t.totalCostBasis} value={formatMoney(result.total_cost_basis_report, reportCurrency)} />
            <MetricCard label={t.totalMarketValue} value={formatMoney(result.total_market_value_report, reportCurrency)} />
            <MetricCard
              label={t.totalPnl}
              value={formatMoney(result.total_profit_loss_report, reportCurrency)}
              tone={result.total_profit_loss_report >= 0 ? "positive" : "negative"}
            />
            <MetricCard label={t.portfolioVolatility} value={formatPercent(result.portfolio_garch_volatility)} keepDecimals />
            <MetricCard
              label={t.sharpeRatio}
              value={result.sharpe_ratio !== null && result.sharpe_ratio !== undefined ? result.sharpe_ratio.toFixed(2) : "-"}
              tone={result.sharpe_ratio !== null && result.sharpe_ratio !== undefined ? (result.sharpe_ratio >= 1 ? "positive" : result.sharpe_ratio < 0 ? "negative" : "default") : "default"}
              keepDecimals
            />
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">VaR</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Value at Risk</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              {t.varDesc}
            </p>
            <div className="mt-4 h-56 rounded-2xl bg-slate-50 px-3 py-4 sm:mt-5 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={normalCurveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
                  <XAxis
                    dataKey="x"
                    tickFormatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                    stroke="#64748b"
                  />
                  <YAxis hide />
                  <Tooltip
                    content={({ active, label }) => {
                      if (!active || typeof label !== "number") {
                        return null;
                      }
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                          {t.returnLabel} {(label * 100).toFixed(2)}%
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="density" stroke="#0f766e" fill="#99f6e4" fillOpacity={0.45} strokeWidth={2} />
                  <Area type="monotone" dataKey="tailDensity" stroke="#dc2626" fill="#fecaca" fillOpacity={0.95} strokeWidth={0} />
                  {result.var_95_cutoff_return !== null ? (
                    <ReferenceLine
                      x={result.var_95_cutoff_return}
                      stroke="#dc2626"
                      strokeWidth={2}
                      label={{ value: "VaR 95%", position: "insideTopRight", fill: "#dc2626" }}
                    />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.tailProb}</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{(result.var_95_tail_probability * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.varCutoffReturn}</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{formatPercent(result.var_95_cutoff_return)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.varAmount}</p>
                <p className="mt-2 text-2xl font-semibold text-red-600">{result.var_95_amount !== null ? formatMoney(result.var_95_amount, reportCurrency) : "-"}</p>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">CVaR</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{t.cvarTitle}</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              {t.cvarDesc}
            </p>
            <div className="mt-4 h-56 rounded-2xl bg-slate-50 px-3 py-4 sm:mt-5 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={normalCurveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
                  <XAxis
                    dataKey="x"
                    tickFormatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                    stroke="#64748b"
                  />
                  <YAxis hide />
                  <Tooltip
                    content={({ active, label }) => {
                      if (!active || typeof label !== "number") {
                        return null;
                      }
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                          {t.returnLabel} {(label * 100).toFixed(2)}%
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="density" stroke="#7c3aed" fill="#ddd6fe" fillOpacity={0.4} strokeWidth={2} />
                  <Area type="monotone" dataKey="tailDensity" stroke="#b91c1c" fill="#b91c1c" fillOpacity={0.85} strokeWidth={0} />
                  {result.var_95_cutoff_return !== null ? (
                    <ReferenceLine
                      x={result.var_95_cutoff_return}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      strokeWidth={2}
                      label={{ value: "VaR 95%", position: "insideTopRight", fill: "#dc2626", fontSize: 12 }}
                    />
                  ) : null}
                  {result.cvar_95_return !== null ? (
                    <ReferenceLine
                      x={-(result.cvar_95_return)}
                      stroke="#7f1d1d"
                      strokeWidth={2.5}
                      label={{ value: "CVaR 95%", position: "insideTopLeft", fill: "#7f1d1d", fontSize: 12 }}
                    />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.varCutoffReturn}</p>
                <p className="mt-2 text-2xl font-semibold text-red-600">{formatPercent(result.var_95_cutoff_return)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.cvarReturn}</p>
                <p className="mt-2 text-2xl font-semibold text-red-700">{result.cvar_95_return !== null ? formatPercent(-result.cvar_95_return) : "-"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.cvarAmount}</p>
                <p className="mt-2 text-2xl font-semibold text-red-700">{result.cvar_95_amount !== null ? formatMoney(result.cvar_95_amount, reportCurrency) : "-"}</p>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Volatility Trend</p>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mt-2 flex items-center gap-2">
                  <h2 className="text-2xl font-semibold text-ink">{t.volatilityTitle}</h2>
                  <VolatilityTooltip text={t.portfolioVolatilityTooltip} />
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {t.volatilityDesc}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.latestVolatility}</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{formatPercent(result.portfolio_garch_volatility)}</p>
              </div>
            </div>
            <div className="mt-4 h-56 rounded-2xl bg-slate-50 px-3 py-4 sm:mt-5 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={portfolioVolatilitySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      const point = payload?.[0]?.payload as { date?: string } | undefined;
                      const displayDate = point?.date ?? (typeof label === "string" ? label : "");
                      if (!active || !payload?.length) {
                        return null;
                      }
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                          <p>{t.dateLabel} {displayDate || "-"}</p>
                          <p>{t.volatilityLabel} {(Number(payload[0]?.value) * 100).toFixed(2)}%</p>
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="portfolio_volatility" stroke="#0f766e" strokeWidth={2.4} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Drawdown</p>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Maximum Drawdown</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {t.drawdownDesc}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.maxDrawdown}</p>
                <p className="mt-2 text-2xl font-semibold text-red-600">{formatPercent(result.max_drawdown)}</p>
              </div>
            </div>
            <div className="mt-4 h-56 rounded-2xl bg-slate-50 px-3 py-4 sm:mt-5 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={maxDrawdownSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      const point = payload?.[0]?.payload as { date?: string } | undefined;
                      const displayDate = point?.date ?? (typeof label === "string" ? label : "");
                      if (!active || !payload?.length) {
                        return null;
                      }
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                          <p>{t.dateLabel} {displayDate || "-"}</p>
                          <p>{t.volatilityLabel} {(Number(payload[0]?.value) * 100).toFixed(2)}%</p>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="drawdown" stroke="#dc2626" fill="#fecaca" fillOpacity={0.85} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Weights</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Market Value Weights</h2>
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={120} paddingAngle={2}>
                      {pieData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatMoney(value, reportCurrency)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Volatility</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">{t.assetVolatility}</h2>
              <div className="mt-5 space-y-3">
                {result.assets.map((asset) => (
                  <div key={asset.asset} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-ink">{asset.asset}</p>
                      <p className="text-lg font-semibold text-ink">{formatPercent(asset.garch_volatility)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Trend</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{t.assetValueTrend}</h2>
            <div className="mt-4 h-64 sm:mt-5 sm:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={normalizedPricesForChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <Tooltip />
                  <Legend />
                  {result.assets.map((asset, index) => (
                    <Line
                      key={asset.asset}
                      type="monotone"
                      dataKey={asset.asset}
                      stroke={PIE_COLORS[index % PIE_COLORS.length]}
                      strokeWidth={2.2}
                      dot={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-panel backdrop-blur">
              <div className="border-b border-slate-100 px-6 py-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Assets</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">{t.assetSummary}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 text-left">{t.asset}</th>
                      <th className="px-5 py-3 text-right">{t.currentPrice}</th>
                      <th className="px-5 py-3 text-right">{t.marketValue}</th>
                      <th className="px-5 py-3 text-right">{t.weight}</th>
                      <th className="px-5 py-3 text-right">{t.pnl}</th>
                      <th className="px-5 py-3 text-right">{t.returnPct}</th>
                      <th className="px-5 py-3 text-right">{t.volatilityCol}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.assets.map((asset) => {
                      const returnRate = asset.cost_basis_report > 0
                        ? asset.profit_loss_report / asset.cost_basis_report
                        : null;
                      const isProfit = asset.profit_loss_report >= 0;
                      return (
                        <tr key={asset.asset} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                          <td className="px-5 py-3.5 font-semibold text-ink">{asset.asset}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-600">
                            {formatMoney(asset.latest_price_report, reportCurrency)}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-700 font-medium">
                            {formatMoney(asset.market_value_report, reportCurrency)}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-500">
                            {formatPercent(asset.market_weight_report)}
                          </td>
                          <td className={`px-5 py-3.5 text-right tabular-nums font-medium ${isProfit ? "text-pine" : "text-red-500"}`}>
                            {isProfit ? "+" : ""}{formatMoney(asset.profit_loss_report, reportCurrency)}
                          </td>
                          <td className={`px-5 py-3.5 text-right tabular-nums text-sm ${isProfit ? "text-pine" : "text-red-500"}`}>
                            {returnRate !== null ? `${isProfit ? "+" : ""}${(returnRate * 100).toFixed(2)}%` : "-"}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-slate-500">
                            {formatPercent(asset.garch_volatility)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-panel backdrop-blur">
              <div className="border-b border-slate-100 px-6 py-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Correlation</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">{t.correlation}</h2>
              </div>
              <div className="overflow-x-auto px-4 py-4">
                {result.correlation[0] ? (() => {
                  const allKeys = Object.keys(result.correlation[0]);
                  const labelKey = allKeys[0];
                  const valueKeys = allKeys.slice(1);
                  return (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th className="px-3 py-2" />
                          {valueKeys.map((key) => (
                            <th key={key} className="px-3 py-2 text-center text-xs font-semibold text-slate-600 whitespace-nowrap">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.correlation.map((row, index) => (
                          <tr key={index} className="border-t border-slate-100">
                            <td className="px-3 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap text-left">
                              {String(row[labelKey])}
                            </td>
                            {valueKeys.map((key) => {
                              const val = row[key];
                              return (
                                <td
                                  key={key}
                                  className="px-3 py-2.5 text-center text-xs tabular-nums"
                                  style={correlationCellStyle(val)}
                                >
                                  {typeof val === "number" ? val.toFixed(2) : "-"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })() : null}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Risk Strategy Prep</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{t.riskSectionTitle}</h2>
            <div className="mt-5 flex flex-col gap-3 text-base text-slate-700 lg:flex-row lg:items-center lg:gap-4">
              <span className="hidden lg:inline">{t.riskPrefix}</span>
              <select
                value={selectedRiskFactorValue}
                onChange={(event) => {
                  setSelectedRiskFactorValue(event.target.value);
                  setRiskResult(null);
                  setRiskErrorMessage("");
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-ember lg:w-auto lg:min-w-[280px]"
              >
                {riskFactorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {t.riskConnector ? <span className="hidden lg:inline">{t.riskConnector}</span> : null}
              <select
                value={riskDirection}
                onChange={(event) => {
                  setRiskDirection(event.target.value as RiskDirection);
                  setRiskResult(null);
                  setRiskErrorMessage("");
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-ember lg:w-[120px]"
              >
                <option value="up">{t.directionUp}</option>
                <option value="down">{t.directionDown}</option>
              </select>
              <span className="hidden lg:inline">{t.riskSuffix}</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleRiskStrategyAnalyze}
                disabled={!selectedRiskFactor || isRiskLoading}
                className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRiskLoading ? t.riskAnalyzing : t.riskAnalyzeBtn}
              </button>
              {selectedRiskFactor ? <p className="text-sm text-slate-500">{t.selectedFactor} {selectedRiskFactor.label}</p> : null}
            </div>

            {riskErrorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{riskErrorMessage}</div>
            ) : null}

            {riskResult ? (
              <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.corrWithPortfolio}</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{formatSignedNumber(riskResult.correlation, 3)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <span>{t.beta}</span>
                    <div className="group relative flex items-center">
                      <button
                        type="button"
                        aria-label={t.betaAriaLabel}
                        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold normal-case text-slate-500"
                      >
                        ?
                      </button>
                      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-64 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] normal-case leading-5 text-slate-600 shadow-lg group-hover:block">
                        {t.betaDesc}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-ink">{formatSignedNumber(riskResult.beta, 3)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t.hedgeRatio}</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{formatSignedNumber(riskResult.hedge_ratio, 3)}</p>
                </div>

              </div>
            ) : null}

            {riskResult?.warnings.length ? (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {riskResult.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}

            {riskResult ? (
              <div className="mt-6 border-t border-slate-100 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">AI Strategy</p>
                    <h3 className="mt-1 text-lg font-semibold text-ink">{t.aiHedgeTitle}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleRecommend}
                    disabled={isRecommending}
                    className="rounded-full bg-pine px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRecommending ? t.generating : t.getRecommendation}
                  </button>
                </div>

                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    OpenAI API Key
                    <span className="ml-1 font-normal text-slate-400">{t.sessionSaved}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={openaiApiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder="sk-..."
                      autoComplete="off"
                      spellCheck={false}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 placeholder-slate-300 outline-none focus:border-pine focus:ring-1 focus:ring-pine"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"
                    >
                      {showApiKey ? t.hide : t.show}
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    {t.additionalContext}
                    <span className="ml-1 font-normal text-slate-400">{t.optional}</span>
                  </label>
                  <textarea
                    value={userContext}
                    onChange={(e) => setUserContext(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder={t.contextPlaceholder}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-300 outline-none focus:border-pine focus:ring-1 focus:ring-pine resize-none"
                  />
                </div>

                {recommendError ? (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {recommendError}
                  </div>
                ) : null}

                {(recommendation || isRecommending) ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-700
                    [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-ink
                    [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink
                    [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-ink
                    [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5
                    [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
                    [&_li]:my-0.5
                    [&_strong]:font-semibold [&_strong]:text-ink
                    [&_p]:my-1.5">
                    <ReactMarkdown>{recommendation}</ReactMarkdown>
                    {isRecommending ? (
                      <span className="inline-block h-4 w-0.5 animate-pulse bg-slate-400" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}







