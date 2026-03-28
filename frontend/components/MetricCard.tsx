type MetricCardProps = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
};

export function MetricCard({ label, value, tone = "default" }: MetricCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-pine"
      : tone === "negative"
        ? "text-red-600"
        : "text-ink";

  return (
    <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur">
      <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
