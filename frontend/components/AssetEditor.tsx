"use client";

import { useEffect, useRef, useState } from "react";

import { fetchTickerPrice, searchTicker, type TickerSearchResult } from "@/lib/api";
import { useLang } from "@/lib/language-context";
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
  const { t } = useLang();
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceAutofilled, setPriceAutofilled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quoteTypeLabel: Record<string, string> = {
    EQUITY: t.qtEquity,
    ETF: "ETF",
    CRYPTOCURRENCY: t.qtCrypto,
    CURRENCY: t.qtCurrency,
    INDEX: t.qtIndex,
    FUTURE: t.qtFuture,
    MUTUALFUND: t.qtFund,
  };

  useEffect(() => {
    if (hideCsv && asset.source_type === "csv") {
      onChange({ ...asset, source_type: "yahoo_finance" });
    }
  }, [hideCsv]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleTickerChange(value: string) {
    onChange({ ...asset, ticker: value });

    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (value.length < 1) {
      setResults([]);
      setIsOpen(false);
      setSearchError(false);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      const data = await searchTicker(value);
      if (data === null) {
        setResults([]);
        setSearchError(true);
        setIsOpen(true);
      } else {
        setSearchError(false);
        setResults(data);
        setIsOpen(data.length > 0);
      }
    }, 300);
  }

  async function handleSelect(result: TickerSearchResult) {
    onChange({
      ...asset,
      ticker: result.symbol,
      name: asset.name || result.name,
    });
    setIsOpen(false);
    setResults([]);
    setPriceAutofilled(false);

    setIsFetchingPrice(true);
    const data = await fetchTickerPrice(result.symbol);
    setIsFetchingPrice(false);
    if (data) {
      onChange({
        ...asset,
        ticker: result.symbol,
        name: asset.name || result.name,
        purchase_price: data.price,
        purchase_currency: data.currency,
      });
      setPriceAutofilled(true);
    }
  }

  return (
    <section className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur sm:rounded-[28px] sm:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-ink">Asset {index + 1}</h3>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:border-red-200 hover:text-red-600"
        >
          {t.remove}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 md:grid-cols-2">
        {asset.source_type === "yahoo_finance" ? (
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            {t.ticker}
            <div ref={containerRef} className="relative">
              <input
                value={asset.ticker}
                onChange={(e) => handleTickerChange(e.target.value)}
                onFocus={() => results.length > 0 && setIsOpen(true)}
                onKeyDown={(e) => e.key === "Escape" && setIsOpen(false)}
                placeholder={t.tickerPlaceholder}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
              />
              {isOpen && (
                <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                  {searchError ? (
                    <li className="px-4 py-3 text-sm text-amber-600">
                      {t.serverStartingSearch}
                    </li>
                  ) : (
                    results.map((r) => (
                      <li key={r.symbol}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelect(r);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                        >
                          <span className="font-mono text-sm font-semibold text-ink">{r.symbol}</span>
                          <span className="flex-1 truncate text-sm text-slate-600">{r.name}</span>
                          {r.type && (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              {quoteTypeLabel[r.type] ?? r.type}
                            </span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </label>
        ) : (
          <label className="flex flex-col gap-2 text-sm text-slate-700">
            {t.priceCsv}
            <textarea
              value={asset.csv_text}
              onChange={(event) => onChange({ ...asset, csv_text: event.target.value })}
              className="min-h-40 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm outline-none transition focus:border-ember"
            />
          </label>
        )}

        <label className="flex flex-col gap-2 text-sm text-slate-700">
          {t.priceSource}
          <select
            value={asset.source_type}
            onChange={(event) => onChange({ ...asset, source_type: event.target.value as AssetDraft["source_type"] })}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-ember"
          >
            <option value="yahoo_finance">Yahoo Finance</option>
            {!hideCsv && <option value="csv">{t.csvInput}</option>}
          </select>
        </label>

        <div className="flex flex-col gap-2 text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <span>{t.purchasePrice}</span>
            {isFetchingPrice && (
              <svg className="h-3.5 w-3.5 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {priceAutofilled && !isFetchingPrice && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                현재가 자동입력
              </span>
            )}
          </div>
          <div className="grid grid-cols-[1fr_92px] gap-2">
            <input
              type="number"
              min="0"
              step="0.0001"
              value={asset.purchase_price}
              onChange={(event) => {
                setPriceAutofilled(false);
                onChange({ ...asset, purchase_price: Number(event.target.value) });
              }}
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
          {t.quantity}
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
