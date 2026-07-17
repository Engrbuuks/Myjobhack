export function StatCard({ label, value, hint, accent }: {
  label: string; value: string | number; hint?: string; accent?: boolean;
}) {
  return (
    <div className={`card p-6 ${accent ? "bg-ink text-white border-ink" : ""}`}>
      <div className={`text-xs font-bold uppercase tracking-widest mb-3 ${accent ? "text-[#FFB4AC]" : "text-muted"}`}>
        {label}
      </div>
      <div className={`numeral ${accent ? "text-coral" : ""}`}>{value}</div>
      {hint && <div className={`text-xs mt-2 ${accent ? "text-white/50" : "text-muted-2"}`}>{hint}</div>}
    </div>
  );
}
