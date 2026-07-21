"use client";
import { useEffect, useState, useRef } from "react";

type Parts = { d: number; h: number; m: number; s: number; total: number };

function split(ms: number): Parts {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, total };
}

/** Live deadline countdown. Ticks every second, flips digits, pulses when urgent. */
export function Countdown({ to, compact, dark = true }: { to: string | null; compact?: boolean; dark?: boolean }) {
  const [p, setP] = useState<Parts | null>(null);
  const prev = useRef<Parts | null>(null);

  useEffect(() => {
    if (!to) return;
    const target = new Date(to).getTime();
    const tick = () => {
      const next = split(target - Date.now());
      prev.current = p;
      setP(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  if (!to || !p || p.total <= 0) return null;

  const hours = p.total / 3_600_000;
  const urgent = hours < 72;
  const critical = hours < 24;

  if (compact) {
    return (
      <span className={`mjh-cd-compact ${critical ? "crit" : urgent ? "urg" : ""}`}>
        <span className="dot" />
        {p.d > 0 ? `${p.d}d ${p.h}h` : p.h > 0 ? `${p.h}h ${p.m}m` : `${p.m}m ${p.s}s`} left
        <style jsx>{`
          .mjh-cd-compact { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:800;
            letter-spacing:.02em; color:${dark ? "rgba(255,255,255,.5)" : "#6B6E7B"}; }
          .dot { width:6px; height:6px; border-radius:50%; background:${dark ? "rgba(255,255,255,.4)" : "#9A9CA6"}; }
          .urg { color:#FC5647; }
          .urg .dot { background:#FC5647; animation:mjhPulseDot 1.6s ease-in-out infinite; }
          .crit { color:#FC5647; }
          .crit .dot { background:#FC5647; animation:mjhPulseDot .8s ease-in-out infinite; }
          @keyframes mjhPulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.82)} }
        `}</style>
      </span>
    );
  }

  const cells: Array<[number, string]> = p.d > 0
    ? [[p.d, "days"], [p.h, "hrs"], [p.m, "min"], [p.s, "sec"]]
    : [[p.h, "hrs"], [p.m, "min"], [p.s, "sec"]];

  return (
    <div className={`mjh-cd ${critical ? "crit" : urgent ? "urg" : ""}`}>
      <div className="cd-label">
        <span className="ring" />
        {critical ? "Closing today" : urgent ? "Closing soon" : "Applications close in"}
      </div>
      <div className="cd-cells">
        {cells.map(([v, l], i) => (
          <div className="cell" key={l}>
            <span className="num" key={`${l}-${v}`}>{String(v).padStart(2, "0")}</span>
            <span className="lab">{l}</span>
            {i < cells.length - 1 && <span className="sep">:</span>}
          </div>
        ))}
      </div>
      <style jsx>{`
        .mjh-cd { display:inline-flex; flex-direction:column; gap:10px; padding:16px 20px; border-radius:18px;
          border:1px solid ${dark ? "rgba(255,255,255,.12)" : "rgba(12,13,17,.1)"};
          background:${dark ? "rgba(255,255,255,.04)" : "rgba(12,13,17,.02)"}; transition:border-color .3s, background .3s; }
        .cd-label { display:flex; align-items:center; gap:9px; font-size:10px; font-weight:800;
          letter-spacing:.2em; text-transform:uppercase; color:${dark ? "rgba(255,255,255,.5)" : "#6B6E7B"}; }
        .ring { width:8px; height:8px; border-radius:50%; background:${dark ? "rgba(255,255,255,.4)" : "#9A9CA6"}; position:relative; }
        .cd-cells { display:flex; align-items:flex-end; gap:4px; }
        .cell { display:flex; flex-direction:column; align-items:center; position:relative; min-width:46px; }
        .num { font-family:var(--font-display, Georgia), serif; font-weight:600; font-size:30px; line-height:1;
          color:${dark ? "#fff" : "#083E40"}; font-variant-numeric:tabular-nums;
          animation:mjhFlip .42s cubic-bezier(.2,.8,.3,1); }
        .lab { font-size:9px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; margin-top:5px;
          color:${dark ? "rgba(255,255,255,.38)" : "#9A9CA6"}; }
        .sep { position:absolute; right:-6px; top:2px; font-size:24px; font-weight:300;
          color:${dark ? "rgba(255,255,255,.22)" : "rgba(12,13,17,.2)"}; }
        .urg { border-color:rgba(252,86,71,.45); background:rgba(252,86,71,.08); }
        .urg .cd-label, .crit .cd-label { color:#FC5647; }
        .urg .num, .crit .num { color:#FC5647; }
        .urg .ring, .crit .ring { background:#FC5647; }
        .urg .ring::after, .crit .ring::after { content:""; position:absolute; inset:-5px; border-radius:50%;
          border:1.5px solid #FC5647; animation:mjhRing 1.8s cubic-bezier(.2,.7,.3,1) infinite; }
        .crit { border-color:rgba(252,86,71,.7); background:rgba(252,86,71,.14);
          animation:mjhBreathe 2.4s ease-in-out infinite; }
        .crit .ring::after { animation-duration:1s; }
        @keyframes mjhFlip { 0%{transform:translateY(-42%) rotateX(52deg); opacity:0} 100%{transform:none; opacity:1} }
        @keyframes mjhRing { 0%{transform:scale(.7);opacity:.9} 100%{transform:scale(1.9);opacity:0} }
        @keyframes mjhBreathe { 0%,100%{box-shadow:0 0 0 0 rgba(252,86,71,.28)} 50%{box-shadow:0 0 0 12px rgba(252,86,71,0)} }
        @media (prefers-reduced-motion:reduce) {
          .num { animation:none } .ring::after { animation:none } .crit { animation:none }
        }
      `}</style>
    </div>
  );
}
