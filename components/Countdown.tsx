"use client";
import { useEffect, useState } from "react";

/** Live countdown to an application deadline. Hides itself once expired. */
export function Countdown({ to, compact }: { to: string | null; compact?: boolean }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!to) return;
    const tick = () => setLeft(new Date(to).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [to]);

  if (!to || left === null || left <= 0) return null;

  const mins = Math.floor(left / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const urgent = days < 3;

  const text = days > 0
    ? `${days}d ${hours}h left`
    : hours > 0
      ? `${hours}h ${mins % 60}m left`
      : `${mins}m left`;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${urgent ? "text-coral" : "text-white/50"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${urgent ? "bg-coral animate-pulse" : "bg-white/40"}`} />
        {text}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-pill text-xs font-bold border ${
      urgent ? "border-coral/50 bg-coral/15 text-coral" : "border-white/15 text-white/70"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${urgent ? "bg-coral animate-pulse" : "bg-white/50"}`} />
      Closes in {text}
    </span>
  );
}
