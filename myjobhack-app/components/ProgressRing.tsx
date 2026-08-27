/** SVG radial progress — completion as an object of pride. */
export function ProgressRing({ pct, size = 128, label }: { pct: number; size?: number; label?: string }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FC5647" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute text-center">
        <div className="font-display font-semibold text-3xl leading-none">{pct}%</div>
        {label && <div className="text-[10px] font-bold uppercase tracking-widest text-white/45 mt-1">{label}</div>}
      </div>
    </div>
  );
}
