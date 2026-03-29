type MetricCardProps = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
  keepDecimals?: boolean;
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

export function MetricCard({ label, value, tone = "default", keepDecimals = false }: MetricCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-pine"
      : tone === "negative"
        ? "text-red-600"
        : "text-ink";

  const displayValue = keepDecimals ? value : stripDecimals(value);

  return (
    <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur">
      <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-3 font-semibold leading-tight ${fontSizeClass(displayValue.length)} ${toneClass}`}>
        {displayValue}
      </p>
    </div>
  );
}
