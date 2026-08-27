"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Tax = { id: string; kind: string; label: string };
const LEVELS = ["entry", "junior", "mid", "senior", "lead", "executive"];
const MODES = ["remote", "hybrid", "onsite", "flexible"];
const RELOC = ["none", "domestic", "international"];

export function SegmentFilterBar({ taxonomies }: { taxonomies: Tax[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }
  const val = (k: string) => sp.get(k) ?? "";
  const sel = "input !h-10 !rounded-xl text-sm !w-auto min-w-36 pr-8";

  const niches = taxonomies.filter((t) => t.kind === "niche");
  const goals = taxonomies.filter((t) => t.kind === "career_goal");
  const skills = taxonomies.filter((t) => t.kind === "expertise");

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <input
        className="input !h-10 !rounded-xl text-sm !w-60"
        placeholder="Keyword — name, headline, skill…"
        defaultValue={val("q")}
        onKeyDown={(e) => { if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value.trim()); }}
        onBlur={(e) => { if (e.target.value.trim() !== val("q")) setParam("q", e.target.value.trim()); }}
      />
      <select className={sel} value={val("niche")} onChange={(e) => setParam("niche", e.target.value)}>
        <option value="">Niche · all</option>
        {niches.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <select className={sel} value={val("goal")} onChange={(e) => setParam("goal", e.target.value)}>
        <option value="">Goal · all</option>
        {goals.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <select className={sel} value={val("expertise")} onChange={(e) => setParam("expertise", e.target.value)}>
        <option value="">Expertise · all</option>
        {skills.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <select className={sel} value={val("level")} onChange={(e) => setParam("level", e.target.value)}>
        <option value="">Level · all</option>
        {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <select className={sel} value={val("mode")} onChange={(e) => setParam("mode", e.target.value)}>
        <option value="">Mode · all</option>
        {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select className={sel} value={val("reloc")} onChange={(e) => setParam("reloc", e.target.value)}>
        <option value="">Relocation · all</option>
        {RELOC.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <select className={sel} value={val("min_completion")} onChange={(e) => setParam("min_completion", e.target.value)}>
        <option value="">Completion · any</option>
        <option value="60">≥ 60%</option>
        <option value="85">≥ 85%</option>
        <option value="100">100%</option>
      </select>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="accent-[#FC5647] w-4 h-4"
          checked={val("verified") === "yes"}
          onChange={(e) => setParam("verified", e.target.checked ? "yes" : "")} />
        Verified only
      </label>
      {sp.toString() && (
        <button className="text-sm font-semibold text-coral" onClick={() => router.push(pathname)}>
          Clear filters ×
        </button>
      )}
    </div>
  );
}
