"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string; type: "credential" | "elite"; name: string; email: string;
  line1: string; line2: string; docUrl: string | null; created_at: string;
};

export function VerificationQueue({ items, chapters }: {
  items: Item[]; chapters: { id: string; city: string; country: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chapterSel, setChapterSel] = useState<Record<string, string>>({});

  const [rejecting, setRejecting] = useState<Item | null>(null);
  const [reason, setReason] = useState("");

  // The reasons that come up most often, so a reviewer isn't writing prose
  // for every rejection — but can still edit or write their own.
  const COMMON_REASONS = [
    "The document is too blurred or low-resolution to read.",
    "This looks like a photo of a screen rather than the document itself.",
    "The name on the document doesn't match the name on your profile.",
    "The institution or award couldn't be confirmed from what was uploaded.",
    "Part of the document is cut off — please upload the full page.",
    "This appears to be a different document to the one described."
  ];

  async function act(item: Item, action: "verify" | "reject", notes?: string) {
    setBusy(item.id); setErr(null);
    const res = await fetch("/api/admin/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: item.type, id: item.id, action, notes: notes ?? null,
        chapter_id: item.type === "elite" ? chapterSel[item.id] || null : undefined
      })
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return; }
    setRejecting(null); setReason("");
    router.refresh();
  }

  const rejectDialog = rejecting && (
    <div className="fixed inset-0 bg-ink/50 grid place-items-center z-50 p-4"
      onClick={() => busy === null && setRejecting(null)}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-display font-semibold text-lg">Why are you rejecting this?</h3>
          <p className="text-sm text-muted-2">
            {rejecting.name} · {rejecting.line1}
          </p>
          <p className="text-sm text-muted-2 mt-1">
            This is sent to them by email and shown in their portal, so they know what to fix.
          </p>
        </div>

        <div>
          <label className="label !text-xs">Common reasons</label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={`text-left text-xs px-2.5 py-1.5 rounded-pill border transition ${
                  reason === r ? "bg-ink text-white border-ink" : "border-line hover:border-coral"}`}>
                {r.length > 42 ? r.slice(0, 40) + "…" : r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label !text-xs">Reason <span className="text-coral">*</span></label>
          <textarea className="input !h-auto py-2" rows={3} value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain what was wrong and what they should upload instead." />
        </div>

        {err && <p className="text-sm text-coral">{err}</p>}

        <div className="flex gap-3">
          <button className="btn-coral" disabled={busy !== null || !reason.trim()}
            onClick={() => act(rejecting, "reject", reason.trim())}>
            {busy ? "Sending…" : "Reject and notify"}
          </button>
          <button className="btn-ghost" onClick={() => setRejecting(null)} disabled={busy !== null}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  if (items.length === 0)
    return <>{rejectDialog}<div className="card p-10 text-center text-sm text-muted">All verification queues are clear. ✓</div></>;

  return (
    <div className="space-y-3 max-w-3xl">
      {rejectDialog}
      {err && !rejecting && <p className="text-coral text-sm">{err}</p>}
      {items.map((it) => (
        <div key={`${it.type}-${it.id}`} className="card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className={`px-2.5 py-1 rounded-pill text-[10px] font-bold uppercase tracking-widest ${
              it.type === "elite" ? "bg-ink text-white" : "bg-coral-soft text-coral"}`}>
              {it.type === "elite" ? "Elite" : "Credential"}
            </span>
            <div className="flex-1 min-w-52">
              <div className="font-semibold text-sm">{it.name} <span className="text-muted-2 font-normal">· {it.email}</span></div>
              <div className="text-xs text-muted-2 mt-0.5">{it.line1}{it.line2 ? ` · ${it.line2}` : ""}</div>
            </div>
            {it.docUrl && (
              <a href={it.docUrl} target="_blank" rel="noopener" className="btn-ghost !h-10">View document</a>
            )}
            {it.type === "elite" && (
              <select className="input !h-10 !w-auto text-sm"
                value={chapterSel[it.id] ?? ""}
                onChange={(e) => setChapterSel((c) => ({ ...c, [it.id]: e.target.value }))}>
                <option value="">Assign chapter…</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.city}</option>)}
              </select>
            )}
            <button className="btn-coral !h-10" disabled={busy === it.id} onClick={() => act(it, "verify")}>
              {busy === it.id ? "…" : "Verify ✓"}
            </button>
            <button className="text-sm font-semibold text-muted hover:text-coral" disabled={busy === it.id}
              onClick={() => { setReason(""); setRejecting(it); }}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
