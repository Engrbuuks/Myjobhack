import { ReactNode } from "react";

/** Ink hero panel — the marketing site's confidence, inside the portals. */
export function DashHero({ kicker, title, sub, right, children }: {
  kicker: string; title: string; sub?: string; right?: ReactNode; children?: ReactNode;
}) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long"
  });
  return (
    <section className="relative overflow-hidden rounded-card bg-ink text-white px-8 py-9 md:px-10 mb-8 border border-ink">
      {/* aura */}
      <div className="pointer-events-none absolute -top-28 -right-24 w-96 h-96 rounded-full bg-coral/[.17] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-coral/[.08] blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-8">
        <div className="flex-1 min-w-64">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2 h-2 rounded-full bg-coral" />
            <span className="text-[11px] font-extrabold uppercase tracking-[.24em] text-[#FFB4AC]">{kicker}</span>
            <span className="text-[11px] text-white/35 font-semibold ml-auto md:ml-4">{today}</span>
          </div>
          <h1 className="font-display font-semibold text-[clamp(26px,3.4vw,38px)] leading-[1.12] tracking-[-0.01em]">
            {title}
          </h1>
          {sub && <p className="text-white/55 text-sm mt-3 max-w-xl leading-relaxed">{sub}</p>}
          {children && <div className="mt-5">{children}</div>}
        </div>
        {right && <div className="relative shrink-0">{right}</div>}
      </div>
    </section>
  );
}
