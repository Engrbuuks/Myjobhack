"use client";
import { useState } from "react";

type SeekerPlan = { id: string; name: string; price_ngn: number; price_usd: number; interval: string; features: string[]; active: boolean };
type EmployerPlan = { id: string; name: string; price_ngn: number; price_usd: number; interval: string; profile_views_per_month: number | null; can_search_pool: boolean; can_contact: boolean; can_request_assessment: boolean; featured_job_slots: number; active: boolean };
type Loose = { assessment_per_candidate_ngn?: number; assessment_per_candidate_usd?: number; elite_premium_ngn?: number; elite_premium_usd?: number; placement_elite_percent?: number; placement_general_ngn?: number; elite_unlock_premium_ngn?: number; elite_free_assessments?: number; job_assessment_per_candidate_ngn?: number; placement_basis?: string; placement_multiple?: number };
type Training = { id: string; title: string; price_ngn: number; price_usd: number };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h3 className="font-display font-semibold text-lg mb-3">{title}</h3>
      {children}
    </div>
  );
}

export function PricingCenter({ seekerPlans, employerPlans, trainings, loose }: { seekerPlans: SeekerPlan[]; employerPlans: EmployerPlan[]; trainings: Training[]; loose: Loose }) {
  const [note, setNote] = useState<string | null>(null);
  const [sp, setSp] = useState(seekerPlans);
  const [ep, setEp] = useState(employerPlans);
  const [tr, setTr] = useState(trainings);
  const [lo, setLo] = useState<Loose>({
    assessment_per_candidate_ngn: loose.assessment_per_candidate_ngn ?? 3500,
    assessment_per_candidate_usd: loose.assessment_per_candidate_usd ?? 3,
    elite_premium_ngn: loose.elite_premium_ngn ?? 5000,
    elite_premium_usd: loose.elite_premium_usd ?? 4,
    placement_elite_percent: loose.placement_elite_percent ?? 10,
    placement_general_ngn: loose.placement_general_ngn ?? 25000,
    elite_unlock_premium_ngn: loose.elite_unlock_premium_ngn ?? 5000,
    elite_free_assessments: loose.elite_free_assessments ?? 3,
    job_assessment_per_candidate_ngn: loose.job_assessment_per_candidate_ngn ?? 5000,
    placement_basis: loose.placement_basis ?? "annual",
    placement_multiple: loose.placement_multiple ?? 1
  });

  async function post(body: any) {
    const res = await fetch("/api/admin/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    setNote(res.ok ? "Saved." : (j.error ?? "Failed."));
    setTimeout(() => setNote(null), 2500);
  }

  return (
    <div className="max-w-4xl">
      {note && <div className="fixed top-6 right-6 bg-ink text-white px-4 py-2 rounded-pill text-sm font-semibold z-50">{note}</div>}

      {/* SEEKER / ELITE PLANS */}
      <Section title="Member & Elite subscriptions">
        <div className="space-y-3">
          {sp.map((p, i) => (
            <div key={p.id} className="card p-4 grid sm:grid-cols-[1fr_110px_110px_130px_auto] gap-3 items-end">
              <div><label className="label !text-xs">Name</label>
                <input className="input !h-10" value={p.name} onChange={(e) => setSp(sp.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
              <div><label className="label !text-xs">₦</label>
                <input className="input !h-10" type="number" value={p.price_ngn} onChange={(e) => setSp(sp.map((x, j) => j === i ? { ...x, price_ngn: Number(e.target.value) } : x))} /></div>
              <div><label className="label !text-xs">$</label>
                <input className="input !h-10" type="number" value={p.price_usd} onChange={(e) => setSp(sp.map((x, j) => j === i ? { ...x, price_usd: Number(e.target.value) } : x))} /></div>
              <div><label className="label !text-xs">Period</label>
                <select className="input !h-10" value={p.interval} onChange={(e) => setSp(sp.map((x, j) => j === i ? { ...x, interval: e.target.value } : x))}>
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></div>
              <button className="btn-coral !h-10" onClick={() => post({ kind: "seeker_plan", id: p.id, data: { name: p.name, price_ngn: p.price_ngn, price_usd: p.price_usd, interval: p.interval } })}>Save</button>
            </div>
          ))}
        </div>
      </Section>

      {/* EMPLOYER PLANS */}
      <Section title="Employer plans (pool access)">
        <div className="space-y-3">
          {ep.map((p, i) => (
            <div key={p.id} className="card p-4">
              <div className="grid sm:grid-cols-[1fr_110px_110px_120px] gap-3 items-end mb-3">
                <div><label className="label !text-xs">Name</label>
                  <input className="input !h-10" value={p.name} onChange={(e) => setEp(ep.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></div>
                <div><label className="label !text-xs">₦</label>
                  <input className="input !h-10" type="number" value={p.price_ngn} onChange={(e) => setEp(ep.map((x, j) => j === i ? { ...x, price_ngn: Number(e.target.value) } : x))} /></div>
                <div><label className="label !text-xs">$</label>
                  <input className="input !h-10" type="number" value={p.price_usd} onChange={(e) => setEp(ep.map((x, j) => j === i ? { ...x, price_usd: Number(e.target.value) } : x))} /></div>
                <div><label className="label !text-xs">Views/mo (blank=∞)</label>
                  <input className="input !h-10" type="number" value={p.profile_views_per_month ?? ""} onChange={(e) => setEp(ep.map((x, j) => j === i ? { ...x, profile_views_per_month: e.target.value === "" ? null : Number(e.target.value) } : x))} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-[#FC5647]" checked={p.can_search_pool} onChange={(e) => setEp(ep.map((x, j) => j === i ? { ...x, can_search_pool: e.target.checked } : x))} /> search pool</label>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-[#FC5647]" checked={p.can_contact} onChange={(e) => setEp(ep.map((x, j) => j === i ? { ...x, can_contact: e.target.checked } : x))} /> contact</label>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="accent-[#FC5647]" checked={p.can_request_assessment} onChange={(e) => setEp(ep.map((x, j) => j === i ? { ...x, can_request_assessment: e.target.checked } : x))} /> assessments</label>
                <div className="flex items-center gap-1.5 text-xs">featured slots <input className="input !h-8 !w-16" type="number" value={p.featured_job_slots} onChange={(e) => setEp(ep.map((x, j) => j === i ? { ...x, featured_job_slots: Number(e.target.value) } : x))} /></div>
                <button className="btn-coral !h-9 text-sm ml-auto" onClick={() => post({ kind: "employer_plan", id: p.id, data: { name: p.name, price_ngn: p.price_ngn, price_usd: p.price_usd, profile_views_per_month: p.profile_views_per_month, can_search_pool: p.can_search_pool, can_contact: p.can_contact, can_request_assessment: p.can_request_assessment, featured_job_slots: p.featured_job_slots } })}>Save</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* TRAININGS */}
      {tr.length > 0 && (
        <Section title="Training prices">
          <div className="space-y-2">
            {tr.map((t, i) => (
              <div key={t.id} className="card p-3 grid sm:grid-cols-[1fr_120px_120px_auto] gap-3 items-end">
                <div className="min-w-0"><label className="label !text-xs">Training</label>
                  <div className="font-semibold text-sm truncate py-2">{t.title}</div></div>
                <div><label className="label !text-xs">₦</label>
                  <input className="input !h-10" type="number" value={t.price_ngn} onChange={(e) => setTr(tr.map((x, j) => j === i ? { ...x, price_ngn: Number(e.target.value) } : x))} /></div>
                <div><label className="label !text-xs">$</label>
                  <input className="input !h-10" type="number" value={t.price_usd} onChange={(e) => setTr(tr.map((x, j) => j === i ? { ...x, price_usd: Number(e.target.value) } : x))} /></div>
                <button className="btn-coral !h-10" onClick={() => post({ kind: "training", id: t.id, data: { price_ngn: t.price_ngn, price_usd: t.price_usd } })}>Save</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* LOOSE PRICES */}
      <Section title="Assessments & Elite premium">
        <div className="card p-5 grid sm:grid-cols-2 gap-5">
          <div>
            <div className="font-semibold text-sm mb-2">Per-candidate assessment</div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label !text-xs">₦</label><input className="input !h-10" type="number" value={lo.assessment_per_candidate_ngn} onChange={(e) => setLo({ ...lo, assessment_per_candidate_ngn: Number(e.target.value) })} /></div>
              <div><label className="label !text-xs">$</label><input className="input !h-10" type="number" value={lo.assessment_per_candidate_usd} onChange={(e) => setLo({ ...lo, assessment_per_candidate_usd: Number(e.target.value) })} /></div>
            </div>
          </div>
          <div>
            <div className="font-semibold text-sm mb-2">Elite premium / month</div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label !text-xs">₦</label><input className="input !h-10" type="number" value={lo.elite_premium_ngn} onChange={(e) => setLo({ ...lo, elite_premium_ngn: Number(e.target.value) })} /></div>
              <div><label className="label !text-xs">$</label><input className="input !h-10" type="number" value={lo.elite_premium_usd} onChange={(e) => setLo({ ...lo, elite_premium_usd: Number(e.target.value) })} /></div>
            </div>
          </div>
        </div>
        <button className="btn-coral mt-3" onClick={() => post({ kind: "loose", data: lo })}>Save assessment & Elite prices</button>
      </Section>

      <Section title="Placement fees & Elite economics">
        <div className="card p-5 grid sm:grid-cols-2 gap-5">
          <div>
            <div className="font-semibold text-sm mb-2">Placement fee — general hire (flat)</div>
            <div><label className="label !text-xs">₦</label><input className="input !h-10" type="number" value={lo.placement_general_ngn} onChange={(e) => setLo({ ...lo, placement_general_ngn: Number(e.target.value) })} /></div>
          </div>
          <div className="sm:col-span-2">
            <div className="font-semibold text-sm mb-2">Placement fee — Elite hire</div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label !text-xs">Charge on</label>
                <select className="input !h-10" value={lo.placement_basis}
                  onChange={(e) => setLo({ ...lo, placement_basis: e.target.value })}>
                  <option value="annual">% of annual salary</option>
                  <option value="monthly">% of monthly salary</option>
                  <option value="multiple">Multiple of monthly salary</option>
                </select>
              </div>
              {lo.placement_basis === "multiple" ? (
                <div>
                  <label className="label !text-xs">Months of salary</label>
                  <input className="input !h-10" type="number" step="0.5" value={lo.placement_multiple}
                    onChange={(e) => setLo({ ...lo, placement_multiple: Number(e.target.value) })} />
                </div>
              ) : (
                <div>
                  <label className="label !text-xs">Percentage</label>
                  <input className="input !h-10" type="number" value={lo.placement_elite_percent}
                    onChange={(e) => setLo({ ...lo, placement_elite_percent: Number(e.target.value) })} />
                </div>
              )}
              <div className="text-xs text-muted-2 self-end pb-2">
                {lo.placement_basis === "multiple"
                  ? `On a ₦400,000/mo hire: ₦${Math.round(400000 * (lo.placement_multiple ?? 1)).toLocaleString()}`
                  : lo.placement_basis === "monthly"
                    ? `On a ₦400,000/mo hire: ₦${Math.round(400000 * ((lo.placement_elite_percent ?? 0) / 100)).toLocaleString()}`
                    : `On a ₦400,000/mo hire: ₦${Math.round(400000 * 12 * ((lo.placement_elite_percent ?? 0) / 100)).toLocaleString()}`}
              </div>
            </div>
          </div>
          <div>
            <div className="font-semibold text-sm mb-2">Elite profile unlock premium</div>
            <div><label className="label !text-xs">₦</label><input className="input !h-10" type="number" value={lo.elite_unlock_premium_ngn} onChange={(e) => setLo({ ...lo, elite_unlock_premium_ngn: Number(e.target.value) })} /></div>
          </div>
          <div>
            <div className="font-semibold text-sm mb-2">Elite free assessments (cap)</div>
            <div><label className="label !text-xs">count</label><input className="input !h-10" type="number" value={lo.elite_free_assessments} onChange={(e) => setLo({ ...lo, elite_free_assessments: Number(e.target.value) })} /></div>
          </div>
          <div>
            <div className="font-semibold text-sm mb-2">Job-specific assessment (employer pays / finalist)</div>
            <div><label className="label !text-xs">₦</label><input className="input !h-10" type="number" value={lo.job_assessment_per_candidate_ngn} onChange={(e) => setLo({ ...lo, job_assessment_per_candidate_ngn: Number(e.target.value) })} /></div>
          </div>
        </div>
        <p className="text-xs text-muted-2 mt-2 max-w-2xl">Elite members are your supply magnet — cheap to carry, valuable because employers pay a premium to reach and hire them. These control that premium.</p>
        <button className="btn-coral mt-3" onClick={() => post({ kind: "loose", data: lo })}>Save placement & Elite economics</button>
      </Section>

      <Section title="Placements & Elite economics">
        <div className="card p-5 space-y-4">
          <p className="text-sm text-muted-2">This is where the real revenue sits — employers pay to hire, more for Elite talent. Elite members pay little; you monetise the demand they create.</p>
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="label !text-xs">Elite placement fee (% of monthly salary)</label>
              <input className="input !h-10" type="number" value={lo.placement_elite_percent}
                onChange={(e) => setLo({ ...lo, placement_elite_percent: Number(e.target.value) })} />
              <p className="text-xs text-muted-2 mt-1">Charged when an employer hires an Elite member.</p>
            </div>
            <div>
              <label className="label !text-xs">General placement fee (₦ flat)</label>
              <input className="input !h-10" type="number" value={lo.placement_general_ngn}
                onChange={(e) => setLo({ ...lo, placement_general_ngn: Number(e.target.value) })} />
              <p className="text-xs text-muted-2 mt-1">Flat fee for a non-Elite hire.</p>
            </div>
            <div>
              <label className="label !text-xs">Elite unlock premium (views spent)</label>
              <input className="input !h-10" type="number" value={lo.elite_unlock_premium_ngn}
                onChange={(e) => setLo({ ...lo, elite_unlock_premium_ngn: Number(e.target.value) })} />
              <p className="text-xs text-muted-2 mt-1">Reference value — Elite profiles currently cost 3 views to unlock vs 1.</p>
            </div>
            <div>
              <label className="label !text-xs">Elite free assessments (cap)</label>
              <input className="input !h-10" type="number" value={lo.elite_free_assessments}
                onChange={(e) => setLo({ ...lo, elite_free_assessments: Number(e.target.value) })} />
              <p className="text-xs text-muted-2 mt-1">How many free assessments an Elite member gets before the premium track.</p>
            </div>
          </div>
          <button className="btn-coral" onClick={() => post({ kind: "loose", data: lo })}>Save placement & economics</button>
        </div>
      </Section>
    </div>
  );
}
