"use client";

import { useState } from "react";

type MetricCardProps = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
  keepDecimals?: boolean;
  tooltip?: string;
};

function stripDecimals(value: string): string {
  return value.replace(/\.\d+/, "");
}

function fontSizeClass(len: number): string {
  if (len <= 10) return "text-3xl";
  if (len <= 13) return "text-2xl";
  if (len <= 16) return "text-xl";
  return "text-lg";
}

export function MetricCard({ label, value, tone = "default", keepDecimals = false, tooltip }: MetricCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const toneClass =
    tone === "positive"
      ? "text-pine"
      : tone === "negative"
        ? "text-red-600"
        : "text-ink";

  const displayValue = keepDecimals ? value : stripDecimals(value);

  return (
    <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur">
      <div className="flex items-center gap-1.5">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{label}</p>
        {tooltip && (
          <div className="relative flex items-center">
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-300 text-[10px] font-bold text-white hover:bg-slate-400 focus:outline-none"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
              aria-label={tooltip}
            >
              i
            </button>
            {showTooltip && (
              <div className="absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-xl bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
                {tooltip}
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
              </div>
            )}
          </div>
        )}
      </div>
      <p className={`mt-3 font-semibold leading-tight ${fontSizeClass(displayValue.length)} ${toneClass}`}>
        {displayValue}
      </p>
    </div>
  );
}
