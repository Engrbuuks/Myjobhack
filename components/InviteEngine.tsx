"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

type Training = { id: string; title: string; delivery: string; starts_at: string | null };

export function InviteEngine({ matched, trainings }: { matched: number; trainings: Training[] }) {
  const sp = useSearchParams();
  const [existingId, setExistingId] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [delivery, setDelivery] = useState("external");
  const [startsAt, setStartsAt] = useState("");
  const [where, setWhere] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function fire() {
    setBusy(true); setErr(null); setResult(null);
    const filters = Object.fromEntries(sp.entries());
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters,
        training: existingId
          ? { id: existingId, title: trainings.find((t) => t.id === existingId)?.title ?? "Training", description, delivery, starts_at: startsAt || null, location_or_link: where }
          : { title, description, delivery, starts_at: startsAt || null, location_or_link: where }
      })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "Failed"); return; }
    setResult(json);
  }

  const canFire = matched > 0 && (existingId || title.trim().length > 2) && !busy;

  return (
    <div className="card p-6 max-w-2xl">
      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">The one button</div>

      <div className="mb-5">
        <label className="label">Training</label>
        <div className="flex gap-2">
            <select className="input !h-11 !w-40 text-sm" value={deliveryFilter}
              onChange={(e) => { setDeliveryFilter(e.target.value); setExistingId(""); }}>
              <option value="">All types</option>
              <option value="lms">LMS courses</option>
              <option value="external">External / live</option>
            </select>
            <select className="input mb-3" value={existingId} onChange={(e) => setExistingId(e.target.value)}>
          <option value="">＋ Create a new training</option>
          {trainings.filter((t) => !deliveryFilter || t.delivery === deliveryFilter).map((t) => (
            <option key={t.id} value={t.id}>{t.title} · {t.delivery}</option>
          ))}
        </select>
          </div>
        {!existingId && (
          <input className="input" placeholder="Training title — e.g. SQL for Analysts (Cohort 2)"
            value={title} onChange={(e) => setTitle(e.target.value)} />
        )}
      </div>

      <div className="mb-5">
        <label className="label">Invitation message</label>
        <textarea className="input !h-auto py-3" rows={3}
          placeholder="One or two sentences on what this training covers and why they were selected."
          value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div>
          <label className="label">Delivery</label>
          <select className="input" value={delivery} onChange={(e) => setDelivery(e.target.value)}>
            <option value="external">External (Zoom/Meet/venue)</option>
            <option value="lms">LMS course</option>
          </select>
        </div>
        <div>
          <label className="label">Starts</label>
          <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label className="label">Link / venue</label>
          <input className="input" placeholder="Zoom link or address" value={where} onChange={(e) => setWhere(e.target.value)} />
        </div>
      </div>

      <button className="btn-coral w-full justify-center !h-14 text-base" disabled={!canFire} onClick={fire}>
        {busy ? "Sending…" : `Send invites to ${matched} talent →`}
      </button>

      {err && <p className="text-coral text-sm mt-4">{err}</p>}
      {result && (
        <div className="mt-5 rounded-xl border border-line p-4 text-sm space-y-1">
          <p><b className="font-display text-xl">{result.sent}</b> sent · {result.failed} failed · {result.skipped} already invited</p>
          {result.note && <p className="text-coral">{result.note}</p>}
          <p className="text-muted">Batch logged with the exact segment filters for audit.</p>
        </div>
      )}
    </div>
  );
}
