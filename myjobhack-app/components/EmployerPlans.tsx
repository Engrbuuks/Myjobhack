"use client";
import { useState } from "react";

type Plan = {
  id: string; name: string; price_ngn: number; price_usd: number; interval: string;
  profile_views_per_month: number | null; can_search_pool: boolean; can_contact: boolean;
  can_request_assessment: boolean; featured_job_slots: number;
};

export function EmployerPlans({ plans, currentPlanId }: { plans: Plan[]; currentPlanId: string | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function choose(planId: string, price: number) {
    setBusy(planId); setNote(null);
    if (price > 0) {
      // Paid plan → Paystack checkout.
      const res = await fetch("/api/pay/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "employer_subscription", plan_id: planId })
      });
      const json = await res.json();
      if (res.ok && json.authorization_url) { window.location.href = json.authorization_url; return; }
      setBusy(null); setNote(json.error ?? "Could not start payment."); return;
    }
    // Free plan → simple activation.
    const res = await fetch("/api/employer/subscribe", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan_id: planId })
    });
    const json = await res.json();
    setBusy(null);
    if (res.ok) setNote(json.message ?? "Plan activated."); else setNote(json.error ?? "Something went wrong.");
  }

  const feat = (on: boolean, label: string) => (
    <li className={`flex items-center gap-2 text-sm ${on ? "" : "text-muted-2 line-through"}`}>
      <span className={on ? "text-green-600" : "text-muted-2"}>{on ? "✓" : "✕"}</span>{label}
    </li>
  );

  return (
    <div>
      <div className="grid md:grid-cols-3 gap-5">
        {plans.map((p) => {
          const current = p.id === currentPlanId;
          const highlight = p.name === "Growth";
          return (
            <div key={p.id} className={`card p-6 flex flex-col ${highlight ? "border-coral border-2" : ""}`}>
              {highlight && <span className="text-xs font-bold uppercase tracking-wide text-coral mb-2">Most popular</span>}
              <div className="font-display font-semibold text-xl">{p.name}</div>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-display font-semibold">₦{Number(p.price_ngn).toLocaleString()}</span>
                <span className="text-sm text-muted-2">/{p.interval === "monthly" ? "mo" : p.interval}</span>
                <div className="text-xs text-muted-2 mt-0.5">or ${p.price_usd}/{p.interval === "monthly" ? "mo" : p.interval}</div>
              </div>
              <ul className="space-y-2 flex-1 mb-5">
                {feat(true, p.profile_views_per_month == null ? "Unlimited profile views" : `${p.profile_views_per_month} profile views / month`)}
                {feat(p.can_search_pool, "Search the full talent pool")}
                {feat(p.can_contact, "Contact candidates directly")}
                {feat(p.can_request_assessment, "Request custom role assessments")}
                {feat(p.featured_job_slots > 0, p.featured_job_slots > 0 ? `${p.featured_job_slots} featured job slot${p.featured_job_slots > 1 ? "s" : ""}` : "Featured job slots")}
              </ul>
              {current ? (
                <span className="btn-ghost justify-center !cursor-default">Current plan</span>
              ) : (
                <button className={highlight ? "btn-coral justify-center" : "btn-ghost justify-center"}
                  disabled={busy !== null} onClick={() => choose(p.id, Number(p.price_ngn))}>
                  {busy === p.id ? "…" : Number(p.price_ngn) === 0 ? "Start free" : "Pay & activate " + p.name}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {note && <p className="text-sm text-green-600 font-semibold mt-5">{note}</p>}
      <p className="text-xs text-muted-2 mt-8 max-w-xl">Payment is by bank transfer or Paystack. Once we confirm payment your plan activates immediately and access unlocks.</p>
    </div>
  );
}
