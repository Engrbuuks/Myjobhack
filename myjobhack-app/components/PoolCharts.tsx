import type { Bucket } from "@/lib/poolStats";

const CORAL = "#FC5647";
const INK = "#083E40";

/** Horizontal bar chart — best for niche/country breakdowns. */
export function BarList({ data, max, unit = "" }: { data: Bucket[]; max?: number; unit?: string }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.count));
  if (!data.length) return <p className="text-sm text-muted-2 py-6 text-center">No data yet.</p>;
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.key} className="flex items-center gap-3">
          <div className="w-28 shrink-0 text-sm text-ink truncate" title={d.label}>{d.label}</div>
          <div className="flex-1 h-6 bg-paper-2 rounded-md overflow-hidden">
            <div className="h-full rounded-md flex items-center justify-end pr-2"
              style={{ width: `${Math.max(4, (d.count / top) * 100)}%`, background: CORAL }}>
              <span className="text-[11px] font-bold text-white">{d.count}{unit}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Line/area chart for signups over time. Pure SVG. */
export function TrendChart({ data }: { data: Bucket[] }) {
  const w = 640, h = 200, pad = 28;
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => {
    const x = pad + i * step;
    const y = h - pad - (d.count / max) * (h - pad * 2);
    return { x, y, ...d };
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1]?.x ?? pad},${h - pad} L${pad},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 240 }}>
      <defs>
        <linearGradient id="poolGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CORAL} stopOpacity="0.25" />
          <stop offset="100%" stopColor={CORAL} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#poolGrad)" />
      <path d={line} fill="none" stroke={CORAL} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => (
        <g key={p.key}>
          <circle cx={p.x} cy={p.y} r="3.5" fill={CORAL} />
          <text x={p.x} y={h - 8} textAnchor="middle" fontSize="10" fill="#9A9CA6">{p.label}</text>
          {p.count > 0 && <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}>{p.count}</text>}
        </g>
      ))}
    </svg>
  );
}

/** Donut for a small categorical split (verification, work mode). */
export function Donut({ data }: { data: Bucket[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const colors = [CORAL, "#FFB4AC", INK, "#C9CBD2", "#6B6E7B"];
  let acc = 0;
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="w-32 h-32 shrink-0">
        <g transform="translate(70,70) rotate(-90)">
          {data.map((d, i) => {
            const frac = d.count / total;
            const dash = frac * C;
            const el = (
              <circle key={d.key} r={R} fill="none" stroke={colors[i % colors.length]} strokeWidth="18"
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc} />
            );
            acc += dash;
            return el;
          })}
        </g>
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={d.key} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="text-ink">{d.label}</span>
            <span className="text-muted-2 font-semibold">{d.count}</span>
            <span className="text-muted-2 text-xs">({Math.round((d.count / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
