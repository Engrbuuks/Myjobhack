import { ReactNode } from "react";
import { Spark } from "@/components/Spark";

export function StatCard({ label, value, hint, accent, spark, icon }: {
  label: string; value: string | number; hint?: string; accent?: boolean;
  spark?: number[]; icon?: ReactNode;
}) {
  return (
    <div className={`group card p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-18px_rgba(12,13,17,.28)] ${
      accent ? "bg-ink text-white border-ink" : ""}`}>
      <span className={`absolute top-0 left-6 right-6 h-px transition-colors ${
        accent ? "bg-white/10 group-hover:bg-coral/60" : "bg-transparent group-hover:bg-coral/50"}`} />
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className={`text-[11px] font-extrabold uppercase tracking-[.18em] ${
          accent ? "text-[#FFB4AC]" : "text-muted"}`}>{label}</div>
        {icon}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className={`numeral leading-none ${accent ? "text-coral" : ""}`}>{value}</div>
        {spark && <Spark data={spark} accent={accent} />}
      </div>
      {hint && <div className={`text-xs mt-3 ${accent ? "text-white/50" : "text-muted-2"}`}>{hint}</div>}
    </div>
  );
}
