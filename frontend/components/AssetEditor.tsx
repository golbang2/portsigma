"use client";

import { useEffect } from "react";

import { REPORT_CURRENCIES } from "@/lib/constants";
import type { AssetDraft } from "@/lib/types";

type AssetEditorProps = {
  asset: AssetDraft;
  index: number;
  hideCsv?: boolean;
  onChange: (next: AssetDraft) => void;
  onRemove: () => void;
};

export function AssetEditor({ asset, index, hideCsv = false, onChange, onRemove }: AssetEditorProps) {
  useEffect(() => {
    if (hideCsv && asset.source_type === "csv") {
      onChange({ ...asset, source_type: "yahoo_finance" });
    }
  }, [hideCsv]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:rounded-[28px] sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-ink">Asset {index + 1}</h3>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-red-200 hover:text-red-600"
        >
          제거
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 md:grid-cols-2">
        {asset.source_type === "yahoo_finance" ? (
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            종목코드
            <input
              value={asset.ticker}
              onChange={(event) => onChange({ ...asset, ticker: event.target.value })}
              placeholder="AAPL, 069500.KS, BTC-USD"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            가격 CSV
            <textarea
              value={asset.csv_text}
              onChange={(event) => onChange({ ...asset, csv_text: event.target.value })}
              className="min-h-40 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm outline-none transition focus:border-ember"
            />
          </label>
        )}

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          가격 소스
          <select
            value={asset.source_type}
            onChange={(event) => onChange({ ...asset, source_type: event.target.value as AssetDraft["source_type"] })}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
          >
            <option value="yahoo_finance">Yahoo Finance</option>
            {!hideCsv && <option value="csv">CSV 입력</option>}
          </select>
        </label>

        <div className="flex flex-col gap-2 text-sm text-slate-700">
          <span>매수가</span>
          <div className="grid grid-cols-[1fr_92px] gap-2">
            <input
              type="number"
              min="0"
              step="0.0001"
              value={asset.purchase_price}
              onChange={(event) => onChange({ ...asset, purchase_price: Number(event.target.value) })}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
            />
            <select
              value={asset.purchase_currency}
              onChange={(event) => onChange({ ...asset, purchase_currency: event.target.value })}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none transition focus:border-ember"
            >
              {REPORT_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          수량
          <input
            type="number"
            min="0"
            step="0.0001"
            value={asset.quantity}
            onChange={(event) => onChange({ ...asset, quantity: Number(event.target.value) })}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
          />
        </label>
      </div>
    </section>
  );
}
