"use client";
import { useState } from "react";

type Draft = {
  subject: string; preheader: string; kicker: string; hook: string;
  opening: string; bullets: string[]; closing: string; cta_label: string; cta_url: string;
};

export function CampaignComposer({ niches }: { niches: { id: string; label: string }[] }) {
  const [clues, setClues] = useState("");
  const [audienceDesc, setAudienceDesc] = useState("");
  const [tone, setTone] = useState("confident and warm");
  const [ctaUrl, setCtaUrl] = useState("https://app.myjobhack.co");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [audience, setAudience] = useState("all_talent");
  const [nicheId, setNicheId] = useState("");
  const [emailList, setEmailList] = useState("");

  async function call(body: Record<string, any>, tag: string) {
    setBusy(tag); setErr(null); setNote(null);
    const res = await fetch("/api/admin/campaign", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return null; }
    return json;
  }

  async function generate() {
    const json = await call({ mode: "draft", clues, audience_desc: audienceDesc, tone, cta_url: ctaUrl }, "draft");
    if (json) { setDraft(json.draft); setHtml(json.html); }
  }
  async function refreshPreview(d: Draft) {
    setDraft(d);
    const json = await call({ mode: "preview", draft: d }, "preview");
    if (json) setHtml(json.html);
  }
  async function sendTest() {
    const json = await call({ mode: "test", draft }, "test");
    if (json?.ok) setNote("Test sent to your inbox ✓");
  }
  async function sendCampaign() {
    if (!window.confirm("Send this campaign to the selected audience?")) return;
    const json = await call({ mode: "send", draft, audience, niche_id: nicheId, email_list: emailList }, "send");
    if (json?.ok) setNote(`Sent ✓ — ${json.sent}/${json.recipients} delivered to Resend${json.failed ? `, ${json.failed} failed` : ""}.`);
  }

  const upd = (patch: Partial<Draft>) => draft && refreshPreview({ ...draft, ...patch });

  return (
    <div className="grid xl:grid-cols-2 gap-6 items-start">
      {/* left: brief + edit */}
      <div className="space-y-5">
        <div className="card p-6">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-4">The brief — give Claude's cousin its clues</div>
          <label className="label">What are we promoting? (be loose — bullet your thoughts)</label>
          <textarea className="input !h-auto py-3 mb-4" rows={4}
            placeholder={"e.g. New Financial Modelling training, starts Aug 3, taught by an ex-banker, 20 seats, ₦15k early bird, certificate included"}
            value={clues} onChange={(e) => setClues(e.target.value)} />
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div><label className="label">Who's it for?</label>
              <input className="input" placeholder="e.g. accounting & finance talent" value={audienceDesc} onChange={(e) => setAudienceDesc(e.target.value)} /></div>
            <div><label className="label">Tone</label>
              <select className="input" value={tone} onChange={(e) => setTone(e.target.value)}>
                <option>confident and warm</option>
                <option>urgent but honest</option>
                <option>playful and energetic</option>
                <option>premium and understated</option>
              </select></div>
          </div>
          <label className="label">CTA destination URL</label>
          <input className="input mb-4" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} />
          <button className="btn-coral" onClick={generate} disabled={busy !== null || !clues.trim()}>
            {busy === "draft" ? "Drafting…" : draft ? "Redraft from clues ↻" : "Draft the email ✦"}
          </button>
        </div>

        {draft && (
          <div className="card p-6">
            <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-4">
              Fine-tune — hook → value → one CTA
            </div>
            <label className="label">Subject ({draft.subject.length}/45)</label>
            <input className="input !h-10 mb-3" value={draft.subject} onChange={(e) => upd({ subject: e.target.value })} />
            <label className="label">Preheader</label>
            <input className="input !h-10 mb-3" value={draft.preheader} onChange={(e) => upd({ preheader: e.target.value })} />
            <label className="label">Hook (the heading)</label>
            <input className="input !h-10 mb-3" value={draft.hook} onChange={(e) => upd({ hook: e.target.value })} />
            <label className="label">Opening line</label>
            <input className="input !h-10 mb-3" value={draft.opening} onChange={(e) => upd({ opening: e.target.value })} />
            <label className="label">Value bullets</label>
            {draft.bullets.map((b, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className="input !h-10 flex-1" value={b}
                  onChange={(e) => upd({ bullets: draft.bullets.map((x, idx) => idx === i ? e.target.value : x) })} />
                <button className="text-muted hover:text-coral" onClick={() => upd({ bullets: draft.bullets.filter((_, idx) => idx !== i) })}>✕</button>
              </div>
            ))}
            <button className="btn-ghost !h-9 text-xs mb-3" onClick={() => upd({ bullets: [...draft.bullets, ""] })}>＋ Bullet</button>
            <label className="label">Closing line (optional)</label>
            <input className="input !h-10 mb-3" value={draft.closing} onChange={(e) => upd({ closing: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">CTA label</label>
                <input className="input !h-10" value={draft.cta_label} onChange={(e) => upd({ cta_label: e.target.value })} /></div>
              <div><label className="label">CTA URL</label>
                <input className="input !h-10" value={draft.cta_url} onChange={(e) => upd({ cta_url: e.target.value })} /></div>
            </div>
          </div>
        )}

        {draft && (
          <div className="card p-6">
            <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-4">Send</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {[["all_talent", "All talent"], ["elite", "Elite only"], ["niche", "By niche"], ["list", "Paste emails"]].map(([v, l]) => (
                <button key={v} className={`px-4 h-10 rounded-pill border text-sm font-semibold transition ${
                  audience === v ? "bg-ink border-ink text-white" : "border-line hover:border-coral"}`}
                  onClick={() => setAudience(v)}>{l}</button>
              ))}
            </div>
            {audience === "niche" && (
              <select className="input mb-4" value={nicheId} onChange={(e) => setNicheId(e.target.value)}>
                <option value="">Choose niche…</option>
                {niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            )}
            {audience === "list" && (
              <textarea className="input !h-auto py-3 mb-4" rows={3} placeholder="one@email.com, two@email.com…"
                value={emailList} onChange={(e) => setEmailList(e.target.value)} />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-ghost !h-11" onClick={sendTest} disabled={busy !== null}>
                {busy === "test" ? "Sending…" : "Send test to me"}
              </button>
              <button className="btn-coral !h-11" onClick={sendCampaign} disabled={busy !== null}>
                {busy === "send" ? "Sending…" : "Send campaign →"}
              </button>
              {note && <span className="text-sm text-muted">{note}</span>}
            </div>
            <p className="text-[11px] text-muted-2 mt-3">Resend free tier: 100 emails/day. Larger audiences need a Resend upgrade first.</p>
          </div>
        )}
        {err && <p className="text-coral text-sm">{err}</p>}
      </div>

      {/* right: live preview */}
      <div className="card p-4 xl:sticky xl:top-6">
        <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3 px-2">Inbox preview</div>
        {draft && (
          <div className="rounded-xl border border-line px-4 py-3 mb-3 bg-paper">
            <div className="text-sm font-bold truncate">{draft.subject || "Subject…"}</div>
            <div className="text-xs text-muted truncate">{draft.preheader || "Preheader…"}</div>
          </div>
        )}
        {html ? (
          <iframe srcDoc={html} className="w-full h-[560px] rounded-xl border border-line bg-white" title="preview" />
        ) : (
          <div className="h-[560px] grid place-items-center text-sm text-muted-2">
            The drafted email renders here — hook, value bullets, one coral CTA.
          </div>
        )}
      </div>
    </div>
  );
}
