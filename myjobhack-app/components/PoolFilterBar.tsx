"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function PoolFilterBar({
  niches, current, countries = [], states = []
}: {
  niches: { id: string; label: string }[];
  current: Record<string, string | undefined>;
  countries?: string[];
  states?: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function set(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`/portal/admin/insights?${params.toString()}`);
  }
  function clear() { router.push("/portal/admin/insights"); }

  const anyActive = Object.values(current).some(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-2xl border border-line bg-paper">
      <div>
        <label className="label !text-xs">Niche</label>
        <select className="input !h-10" value={current.niche_id ?? ""} onChange={(e) => set("niche_id", e.target.value)}>
          <option value="">All niches</option>
          {niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label !text-xs">Verification</label>
        <select className="input !h-10" value={current.verification ?? ""} onChange={(e) => set("verification", e.target.value)}>
          <option value="">Any status</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div>
        <label className="label !text-xs">Work mode</label>
        <select className="input !h-10" value={current.work_mode ?? ""} onChange={(e) => set("work_mode", e.target.value)}>
          <option value="">Any mode</option>
          <option value="onsite">Onsite</option>
          <option value="hybrid">Hybrid</option>
          <option value="remote">Remote</option>
        </select>
      </div>
      <div>
        <label className="label !text-xs">Country</label>
        <select className="input !h-10" value={current.country ?? ""} onChange={(e) => { set("country", e.target.value); }}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="label !text-xs">State</label>
        <select className="input !h-10" value={current.state ?? ""} onChange={(e) => set("state", e.target.value)}>
          <option value="">All states</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="label !text-xs">Seniority</label>
        <select className="input !h-10" value={current.role_level ?? ""} onChange={(e) => set("role_level", e.target.value)}>
          <option value="">Any level</option>
          <option value="entry">Entry</option>
          <option value="junior">Junior</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
          <option value="lead">Lead</option>
          <option value="executive">Executive</option>
        </select>
      </div>
      <div>
        <label className="label !text-xs">Experience</label>
        <select className="input !h-10" value={current.years_bucket ?? ""} onChange={(e) => set("years_bucket", e.target.value)}>
          <option value="">Any</option>
          <option value="0-2">0–2 years</option>
          <option value="3-5">3–5 years</option>
          <option value="6-10">6–10 years</option>
          <option value="10+">10+ years</option>
        </select>
      </div>
      {anyActive && (
        <button onClick={clear} className="btn-ghost !h-10 text-sm">Clear filters</button>
      )}
    </div>
  );
}
