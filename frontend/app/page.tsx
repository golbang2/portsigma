"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
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
import { analyzePortfolio } from "@/lib/api";
import { DEFAULT_PRICE_CSV, HISTORY_PERIODS, REPORT_CURRENCIES } from "@/lib/constants";
import { assetsToPortfolioCsv, parsePortfolioCsv } from "@/lib/portfolio-csv";
import type { AnalyzeResponse, AssetDraft, HistoryPeriod } from "@/lib/types";

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
  const uploadRef = useRef<HTMLInputElement | null>(null);

  async function handleAnalyze() {
    setIsLoading(true);
    setErrorMessage("");
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
    setAssets((current) => current.map((asset) => (asset.id === nextAsset.id ? nextAsset : asset)));
  }

  function addAsset() {
    setAssets((current) => [...current, createAsset(current.length)]);
  }

  function removeAsset(id: string) {
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

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <section className="rounded-[36px] border border-white/70 bg-white/75 p-8 shadow-panel backdrop-blur">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Portsigma</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-ink md:text-5xl">
              자산 비중과 변동성을
              <span className="text-ember"> 한 번에 보는 포트폴리오 대시보드 </span>
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Yahoo Finance 가격 이력, CSV 입력, 환율 변환, 변동성 분석까지 한 화면에서 확인할 수 있습니다.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              포트폴리오 이름
              <input
                value={portfolioName}
                onChange={(event) => setPortfolioName(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              기준 통화
              <select
                value={reportCurrency}
                onChange={(event) => setReportCurrency(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
              >
                {REPORT_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              조회 기간
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value as HistoryPeriod)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
              >
                {HISTORY_PERIODS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-slate-700">
              저장된 포트폴리오 CSV
              <input
                ref={uploadRef}
                type="file"
                accept=".csv"
                onChange={handlePortfolioUpload}
                className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={addAsset}
            className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            자산 추가
          </button>
          <button
            type="button"
            onClick={downloadPortfolioCsv}
            className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-ember hover:text-ember"
          >
            포트폴리오 CSV 저장
          </button>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isLoading}
            className="rounded-full bg-ember px-5 py-3 text-sm font-medium text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
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
          <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="총 투자원가" value={formatMoney(result.total_cost_basis_report, reportCurrency)} />
            <MetricCard label="총 평가금액" value={formatMoney(result.total_market_value_report, reportCurrency)} />
            <MetricCard
              label="총 손익"
              value={formatMoney(result.total_profit_loss_report, reportCurrency)}
              tone={result.total_profit_loss_report >= 0 ? "positive" : "negative"}
            />
            <MetricCard label="포트폴리오 변동성" value={formatPercent(result.portfolio_garch_volatility)} />
            <MetricCard
              label="VaR 95%"
              value={result.var_95_amount !== null ? formatMoney(result.var_95_amount, reportCurrency) : "-"}
              tone="negative"
            />
          </section>

          <section className="mt-8 rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">VaR</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Value at Risk</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              VaR 95%는 포트폴리오의 하루 수익률이 정규분포를 따른다고 가정할 때, 하위 5% 구간에 들어가는 손실 임계값입니다.
              평소와 비슷한 시장 조건이 이어진다면 100일 중 약 5일 정도는 이 손실보다 더 나쁠 수 있습니다.
            </p>
            <div className="mt-5 h-80 rounded-2xl bg-slate-50 px-3 py-4">
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
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

          <section className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
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
                      <div>
                        <p className="font-medium text-ink">{asset.asset}</p>
                        <p className="text-sm text-slate-500">{asset.price_currency}</p>
                      </div>
                      <p className="text-lg font-semibold text-ink">{formatPercent(asset.garch_volatility)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-panel backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Trend</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">정규화 가격 추이</h2>
            <div className="mt-5 h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.normalized_prices}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
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
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
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
        </>
      ) : null}
    </main>
  );
}







