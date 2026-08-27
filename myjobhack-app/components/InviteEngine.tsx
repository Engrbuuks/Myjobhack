"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

type Training = { id: string; title: string; delivery: string; starts_at: string | null };

export function InviteEngine({ matched, trainings }: { matched: number; trainings: Training[] }) {
  const sp = useSearchParams();
  const [existingId, setExistingId] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHook, setEmailHook] = useState("");
  const [emailOpening, setEmailOpening] = useState("");
  const [emailBullets, setEmailBullets] = useState("");
  const [emailClosing, setEmailClosing] = useState("");
  const [emailCta, setEmailCta] = useState("");
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
        message: (emailOpening || emailBullets)
          ? { subject: emailSubject, hook: emailHook, opening: emailOpening,
              bullets: emailBullets.split("\n").map((b) => b.trim()).filter(Boolean),
              closing: emailClosing, cta_label: emailCta }
          : null,
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

  async function draftInviteEmail() {
    setAiBusy(true); setAiErr(null);
    const t = existingId ? trainings.find((x) => x.id === existingId) : null;
    const clues = [
      `Training invitation: ${t?.title ?? title}`,
      description && `About: ${description}`,
      startsAt && `Happens: ${new Date(startsAt).toLocaleString()}`,
      where && `Where: ${where}`,
      `Audience: ${matched} matched talent selected by skill/niche filters`,
      `Goal: get them to accept the invitation in their MYJOBHACK portal`
    ].filter(Boolean).join(". ");
    const res = await fetch("/api/admin/campaign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "draft", clues, tone: "confident and warm",
        cta_url: "https://app.myjobhack.co/portal/seeker/trainings" })
    });
    const json = await res.json();
    setAiBusy(false);
    if (!res.ok) { setAiErr(json.error); return; }
    const d = json.draft;
    setEmailSubject(d.subject ?? ""); setEmailHook(d.hook ?? "");
    setEmailOpening(d.opening ?? ""); setEmailBullets((d.bullets ?? []).join("\n"));
    setEmailClosing(d.closing ?? ""); setEmailCta(d.cta_label ?? "Accept my invite");
  }

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

            <div className="rounded-xl border border-line p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">Invitation email</div>
          <button type="button" className="btn-ghost !h-9 text-xs" onClick={draftInviteEmail} disabled={aiBusy}>
            {aiBusy ? "Drafting…" : "✦ Draft with AI"}
          </button>
        </div>
        <p className="text-[11px] text-muted-2 mb-3">Leave empty to send the standard invite — or let the AI write it from this training&rsquo;s details, then edit.</p>
        {(emailOpening || emailBullets || emailSubject) && (
          <div className="space-y-2">
            <input className="input !h-10 text-sm" placeholder="Subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            <input className="input !h-10 text-sm" placeholder="Hook (email heading)" value={emailHook} onChange={(e) => setEmailHook(e.target.value)} />
            <input className="input !h-10 text-sm" placeholder="Opening line" value={emailOpening} onChange={(e) => setEmailOpening(e.target.value)} />
            <textarea className="input !h-auto py-2.5 text-sm" rows={3} placeholder="Value bullets — one per line" value={emailBullets} onChange={(e) => setEmailBullets(e.target.value)} />
            <input className="input !h-10 text-sm" placeholder="Closing line (optional)" value={emailClosing} onChange={(e) => setEmailClosing(e.target.value)} />
            <input className="input !h-10 text-sm !w-56" placeholder="CTA label" value={emailCta} onChange={(e) => setEmailCta(e.target.value)} />
          </div>
        )}
        {aiErr && <p className="text-coral text-xs mt-2">{aiErr}</p>}
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
