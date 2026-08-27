"use client";
import { useEffect, useState } from "react";

export function StorageMeter() {
  const [d, setD] = useState<{ used_label: string; quota_label: string; pct: number } | null>(null);

  useEffect(() => {
    fetch("/api/storage/usage").then((r) => r.json()).then((j) => { if (!j.error) setD(j); }).catch(() => {});
  }, []);

  if (!d) return null;
  const tight = d.pct >= 80;

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-2">Storage</span>
        <span className={`text-xs font-semibold ${tight ? "text-coral" : "text-muted"}`}>
          {d.used_label} of {d.quota_label}
        </span>
      </div>
      <div className="h-2 rounded-pill bg-paper-2 overflow-hidden">
        <div className={`h-full rounded-pill transition-all duration-700 ${tight ? "bg-coral" : "bg-ink"}`}
          style={{ width: `${Math.max(2, d.pct)}%` }} />
      </div>
      {tight && <p className="text-xs text-coral mt-2">You're close to your limit — delete old files to free space.</p>}
    </div>
  );
}
