/** Tiny real-data bar sparkline (server-rendered SVG). */
export function Spark({ data, accent = false, w = 96, h = 30 }: {
  data: number[]; accent?: boolean; w?: number; h?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const gap = 3;
  const bw = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="block">
      {data.map((v, i) => {
        const bh = Math.max(3, (v / max) * h);
        const last = i === data.length - 1;
        return (
          <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={2}
            fill={last ? "#FC5647" : accent ? "rgba(255,255,255,.22)" : "#E7E5DF"} />
        );
      })}
    </svg>
  );
}

/** Bucket ISO dates into trailing weekly counts (oldest → newest). */
export function weeklyCounts(dates: (string | null | undefined)[], weeks = 8): number[] {
  const now = Date.now();
  const wk = 7 * 864e5;
  const out = Array(weeks).fill(0);
  for (const d of dates) {
    if (!d) continue;
    const age = now - +new Date(d);
    const idx = weeks - 1 - Math.floor(age / wk);
    if (idx >= 0 && idx < weeks) out[idx]++;
  }
  return out;
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - +new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
