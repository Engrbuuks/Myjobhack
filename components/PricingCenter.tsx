"use client";
import { useState } from "react";

type SeekerPlan = { id: string; name: string; price_ngn: number; price_usd: number; interval: string; features: string[]; active: boolean };
type EmployerPlan = { id: string; name: string; price_ngn: number; price_usd: number; interval: string; profile_views_per_month: number | null; can_search_pool: boolean; can_contact: boolean; can_request_assessment: boolean; featured_job_slots: number; active: boolean };
type Loose = { assessment_per_candidate_ngn?: number; assessment_per_candidate_usd?: number; elite_premium_ngn?: number; elite_premium_usd?: number };
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
    elite_premium_usd: loose.elite_premium_usd ?? 4
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
    </div>
  );
}
