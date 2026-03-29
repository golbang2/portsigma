"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
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

import { AssetEditor } from "@/components/AssetEditor";
import { MetricCard } from "@/components/MetricCard";
import { analyzePortfolio, analyzeRiskStrategy } from "@/lib/api";
import { DEFAULT_PRICE_CSV, HISTORY_PERIODS, MAJOR_INDEX_OPTIONS, REPORT_CURRENCIES } from "@/lib/constants";
import { assetsToPortfolioCsv, parsePortfolioCsv } from "@/lib/portfolio-csv";
import type {
  AnalyzeResponse,
  AssetDraft,
  HistoryPeriod,
  RiskDirection,
  RiskFactorType,
  RiskStrategyResponse
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

export default function HomePage() {
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
  const [isMobile, setIsMobile] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function resetRiskAnalysis() {
    setRiskResult(null);
    setRiskErrorMessage("");
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
        assets: assets.map(({ id, ...asset }) => asset)
      });
      setResult(response);
      setWarnings(response.warnings);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "분석 요청에 실패했습니다.");
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
      setErrorMessage(error instanceof Error ? error.message : "포트폴리오 CSV를 읽지 못했습니다.");
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
        label: `${asset.asset} 환율 (${asset.price_currency}/${result.report_currency})`
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
        assets: assets.map(({ id, ...asset }) => asset),
        factor_type: selectedRiskFactor.factorType,
        factor_id: selectedRiskFactor.factorId,
        factor_label: selectedRiskFactor.label,
        direction: riskDirection
      });
      setRiskResult(response);
    } catch (error) {
      setRiskErrorMessage(error instanceof Error ? error.message : "리스크 대비 전략 분석에 실패했습니다.");
    } finally {
      setIsRiskLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="rounded-[28px] border border-white/70 bg-white/75 p-5 shadow-panel backdrop-blur sm:rounded-[36px] sm:p-8">
        {/* 히어로 */}
        <div className="border-b border-slate-100 pb-5 sm:pb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-ember">Portsigma</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-ink sm:text-4xl md:text-5xl">
            자산 비중과 변동성을
            <br />
            <span className="text-ember">한 번에 보는 포트폴리오 대시보드</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">
            Yahoo Finance 가격 이력 · 환율 변환 · GARCH 변동성 분석을 한 화면에서 확인하세요.
          </p>
        </div>

        {/* 설정 */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            포트폴리오 이름
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
            기준 통화
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
            조회 기간
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
            포트폴리오 CSV 불러오기
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
            자산 추가
          </button>
          <button
            type="button"
            onClick={downloadPortfolioCsv}
            className="hidden rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-ember hover:text-ember sm:inline-flex"
          >
            CSV 저장
          </button>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isLoading}
            className="ml-auto rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "분석 중..." : "분석 실행"}
          </button>
        </div>
      </section>

      <section className="mt-8 grid gap-5">
        {assets.map((asset, index) => (
          <AssetEditor
            key={asset.id}
            asset={asset}
            index={index}
            reportCurrency={reportCurrency}
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
            <MetricCard label="총 투자원가" value={formatMoney(result.total_cost_basis_report, reportCurrency)} />
            <MetricCard label="총 평가금액" value={formatMoney(result.total_market_value_report, reportCurrency)} />
            <MetricCard
              label="총 손익"
              value={formatMoney(result.total_profit_loss_report, reportCurrency)}
              tone={result.total_profit_loss_report >= 0 ? "positive" : "negative"}
            />
            <MetricCard label="포트폴리오 변동성" value={formatPercent(result.portfolio_garch_volatility)} keepDecimals />
            <MetricCard
              label="VaR 95%"
              value={result.var_95_amount !== null ? formatMoney(result.var_95_amount, reportCurrency) : "-"}
              tone="negative"
            />
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">VaR</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Value at Risk</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              VaR 95%는 포트폴리오의 하루 수익률이 정규분포를 따른다고 가정할 때, 하위 5% 구간에 들어가는 손실 임계값입니다.
              평소와 비슷한 시장 조건이 이어진다면 100일 중 약 5일 정도는 이 손실보다 더 나쁠 수 있습니다.
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
                          수익률 {(label * 100).toFixed(2)}%
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
            <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">하위 꼬리 확률</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{(result.var_95_tail_probability * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">VaR 컷오프 수익률</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{formatPercent(result.var_95_cutoff_return)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">VaR 금액</p>
                <p className="mt-2 text-2xl font-semibold text-red-600">{result.var_95_amount !== null ? formatMoney(result.var_95_amount, reportCurrency) : "-"}</p>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Volatility Trend</p>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="mt-2 text-2xl font-semibold text-ink">포트폴리오 변동성</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  포트폴리오 일간 수익률에 GARCH를 적용한 조건부 변동성의 흐름입니다.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">최근 변동성</p>
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
                          <p>날짜 {displayDate || "-"}</p>
                          <p>변동성 {(Number(payload[0]?.value) * 100).toFixed(2)}%</p>
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
                  포트폴리오가 이전 고점 대비 얼마나 하락했는지 시간 흐름에 따라 보여줍니다.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">최대 낙폭</p>
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
                          <p>날짜 {displayDate || "-"}</p>
                          <p>변동성 {(Number(payload[0]?.value) * 100).toFixed(2)}%</p>
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
              <h2 className="mt-2 text-2xl font-semibold text-ink">자산별 변동성</h2>
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
            <h2 className="mt-2 text-2xl font-semibold text-ink">자산 가치 추이</h2>
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
                <h2 className="mt-2 text-2xl font-semibold text-ink">자산별 평가표</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3">자산</th>
                      <th className="px-4 py-3">현재가</th>
                      <th className="px-4 py-3">평가금액</th>
                      <th className="px-4 py-3">비중</th>
                      <th className="px-4 py-3">손익</th>
                      <th className="px-4 py-3">σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.assets.map((asset) => (
                      <tr key={asset.asset} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium text-ink">{asset.asset}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {asset.latest_price_report.toFixed(2)} {reportCurrency}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatMoney(asset.market_value_report, reportCurrency)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatPercent(asset.market_weight_report)}</td>
                        <td className={`px-4 py-3 ${asset.profit_loss_report >= 0 ? "text-pine" : "text-red-600"}`}>
                          {formatMoney(asset.profit_loss_report, reportCurrency)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatPercent(asset.garch_volatility)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-panel backdrop-blur">
              <div className="border-b border-slate-100 px-6 py-5">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Correlation</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">상관관계</h2>
              </div>
              <div className="overflow-x-auto px-4 py-4">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      {result.correlation[0]
                        ? Object.keys(result.correlation[0]).map((key) => (
                            <th key={key} className="px-3 py-2">
                              {key}
                            </th>
                          ))
                        : null}
                    </tr>
                  </thead>
                  <tbody>
                    {result.correlation.map((row, index) => (
                      <tr key={index} className="border-t border-slate-100">
                        {Object.entries(row).map(([key, value]) => (
                          <td key={key} className="px-3 py-2 text-slate-600">
                            {typeof value === "number" ? value.toFixed(2) : value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:mt-8 sm:rounded-[30px] sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Risk Strategy Prep</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">리스크 대비 전략 분석</h2>
            <div className="mt-5 flex flex-col gap-3 text-base text-slate-700 lg:flex-row lg:items-center lg:gap-4">
              <span className="hidden lg:inline">나는</span>
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
              <span className="hidden lg:inline">이</span>
              <select
                value={riskDirection}
                onChange={(event) => {
                  setRiskDirection(event.target.value as RiskDirection);
                  setRiskResult(null);
                  setRiskErrorMessage("");
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-ember lg:w-[120px]"
              >
                <option value="up">상승</option>
                <option value="down">하락</option>
              </select>
              <span className="hidden lg:inline">하는 리스크에 대비하고 싶어</span>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleRiskStrategyAnalyze}
                disabled={!selectedRiskFactor || isRiskLoading}
                className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRiskLoading ? "분석 중..." : "리스크 대비 전략 분석"}
              </button>
              {selectedRiskFactor ? <p className="text-sm text-slate-500">선택 요인: {selectedRiskFactor.label}</p> : null}
            </div>

            {riskErrorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{riskErrorMessage}</div>
            ) : null}

            {riskResult ? (
              <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">포트폴리오와 대상자산의 상관계수</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{formatSignedNumber(riskResult.correlation, 3)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <span>베타</span>
                    <div className="group relative flex items-center">
                      <button
                        type="button"
                        aria-label="베타 설명"
                        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold normal-case text-slate-500"
                      >
                        ?
                      </button>
                      <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-64 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] normal-case leading-5 text-slate-600 shadow-lg group-hover:block">
                        포트폴리오가 전체 시장 움직임에 얼마나 민감하게 반응하는지를 나타내는 상대적 변동성 지표입니다.
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-ink">{formatSignedNumber(riskResult.beta, 3)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">헤지비율</p>
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
          </section>
        </>
      ) : null}
    </main>
  );
}








