"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Coupon = {
  id: string; code: string; label: string | null; kind: string; value: number;
  training_id: string | null; training_title: string | null;
  max_redemptions: number | null; max_per_user: number; min_amount_ngn: number;
  starts_at: string | null; expires_at: string | null; active: boolean; redemptions: number;
  stat: { given: number; collected: number; uses: number };
};
type Training = { id: string; title: string; price_ngn: number };

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export function CouponManager({ coupons, trainings }: { coupons: Coupon[]; trainings: Training[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [f, setF] = useState({
    code: "", label: "", kind: "percent", value: "",
    training_id: "", max_redemptions: "", max_per_user: "1",
    min_amount_ngn: "", starts_at: "", expires_at: ""
  });

  async function post(body: any) {
    setBusy(true); setNote(null); setBad(false);
    const res = await fetch("/api/admin/coupon", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    setBusy(false);
    if (res.ok) { setNote("Done."); setTimeout(() => setNote(null), 2000); router.refresh(); }
    else { setNote(j.error ?? "Failed."); setBad(true); }
  }

  function create() {
    post({ action: "create", data: {
      ...f,
      value: Number(f.value),
      max_redemptions: f.max_redemptions || null,
      max_per_user: Number(f.max_per_user) || 1,
      min_amount_ngn: Number(f.min_amount_ngn) || 0,
      training_id: f.training_id || null,
      starts_at: f.starts_at || null, expires_at: f.expires_at || null
    }});
    setF({ ...f, code: "", label: "", value: "" });
  }

  // Live worked example so you see the effect before creating the code.
  const sample = trainings[0]?.price_ngn ?? 20000;
  const val = Number(f.value) || 0;
  const off = f.kind === "percent" ? Math.round(sample * val / 100) : Math.min(val, sample);
  const preview = val > 0 ? `On a ${naira(sample)} training: pays ${naira(Math.max(0, sample - off))} (saves ${naira(off)})` : "";

  return (
    <div className="space-y-6">
      {note && (
        <div className={`fixed top-6 right-6 z-50 max-w-md px-4 py-3 rounded-card text-sm font-semibold shadow-lg ${
          bad ? "bg-coral text-white" : "bg-ink text-white"}`}>
          {note}{bad && <button className="ml-3 underline opacity-80" onClick={() => setNote(null)}>dismiss</button>}
        </div>
      )}

      {/* Create */}
      <div className="card p-5">
        <div className="font-display font-semibold mb-3">Create a coupon</div>
        <div className="grid sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="label !text-xs">Code</label>
            <input className="input !h-10 uppercase" value={f.code} placeholder="ALUMNI25"
              onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label !text-xs">Label (internal)</label>
            <input className="input !h-10" value={f.label} placeholder="e.g. Alumni launch offer"
              onChange={(e) => setF({ ...f, label: e.target.value })} />
          </div>
          <div>
            <label className="label !text-xs">Applies to</label>
            <select className="input !h-10" value={f.training_id}
              onChange={(e) => setF({ ...f, training_id: e.target.value })}>
              <option value="">All trainings</option>
              {trainings.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="label !text-xs">Discount type</label>
            <select className="input !h-10" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="percent">Percentage off</option>
              <option value="amount">Fixed amount off</option>
            </select>
          </div>
          <div>
            <label className="label !text-xs">{f.kind === "percent" ? "Percent" : "Naira off"}</label>
            <input className="input !h-10" type="number" value={f.value}
              onChange={(e) => setF({ ...f, value: e.target.value })} />
          </div>
          <div>
            <label className="label !text-xs">Total uses (blank = unlimited)</label>
            <input className="input !h-10" type="number" value={f.max_redemptions}
              onChange={(e) => setF({ ...f, max_redemptions: e.target.value })} />
          </div>
          <div>
            <label className="label !text-xs">Uses per person</label>
            <input className="input !h-10" type="number" value={f.max_per_user}
              onChange={(e) => setF({ ...f, max_per_user: e.target.value })} />
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label !text-xs">Starts (optional)</label>
            <input className="input !h-10" type="date" value={f.starts_at}
              onChange={(e) => setF({ ...f, starts_at: e.target.value })} />
          </div>
          <div>
            <label className="label !text-xs">Expires (optional)</label>
            <input className="input !h-10" type="date" value={f.expires_at}
              onChange={(e) => setF({ ...f, expires_at: e.target.value })} />
          </div>
          <div className="text-xs text-muted-2 pb-2">{preview}</div>
          <button className="btn-coral !h-10" onClick={create} disabled={busy}>Create coupon</button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {coupons.length === 0 && (
          <div className="card p-10 text-center text-sm text-muted">No coupons yet.</div>
        )}
        {coupons.map((c) => {
          const expired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
          const full = c.max_redemptions != null && c.redemptions >= c.max_redemptions;
          return (
            <div key={c.id} className={`card p-4 ${!c.active || expired || full ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded-pill bg-ink text-white text-sm font-bold tracking-wider">{c.code}</span>
                <span className="px-2.5 py-1 rounded-pill bg-coral text-white text-xs font-bold">
                  {c.kind === "percent" ? `${Number(c.value)}% off` : `${naira(Number(c.value))} off`}
                </span>
                <div className="flex-1 min-w-40">
                  {c.label && <div className="font-semibold text-sm truncate">{c.label}</div>}
                  <div className="text-xs text-muted-2">
                    {c.training_title ?? "All trainings"}
                    {c.max_redemptions != null && ` · ${c.redemptions}/${c.max_redemptions} used`}
                    {c.max_redemptions == null && c.redemptions > 0 && ` · ${c.redemptions} used`}
                    {expired && " · expired"}
                    {full && " · fully redeemed"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-ink">{naira(c.stat.collected)}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-2">collected</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-coral">{naira(c.stat.given)}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-2">discounted</div>
                </div>
                <button className="btn-ghost !h-9 text-xs" disabled={busy}
                  onClick={() => post({ action: "toggle", id: c.id })}>
                  {c.active ? "Disable" : "Enable"}
                </button>
                <button className="text-muted-2 hover:text-coral text-sm px-1" disabled={busy}
                  onClick={() => post({ action: "delete", id: c.id })}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
