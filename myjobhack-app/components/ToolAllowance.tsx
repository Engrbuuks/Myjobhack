"use client";
import { useEffect, useState } from "react";

export function ToolAllowance({ slug }: { slug: string }) {
  const [u, setU] = useState<{ used: number; limit: number } | null>(null);
  useEffect(() => {
    fetch("/api/ai/usage").then((r) => r.json()).then((j) => setU(j.usage?.[slug] ?? null)).catch(() => {});
  }, [slug]);
  if (!u) return null;
  const left = Math.max(0, u.limit - u.used);
  return (
    <div className={`inline-flex items-center gap-2 px-4 h-9 rounded-pill text-xs font-bold mb-6 ${
      left === 0 ? "bg-paper-2 text-muted" : "bg-coral-soft text-coral"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${left === 0 ? "bg-muted" : "bg-coral"}`} />
      {left === 0
        ? "Daily allowance used — resets at midnight"
        : `${left} of ${u.limit} run${u.limit === 1 ? "" : "s"} left today`}
    </div>
  );
}
