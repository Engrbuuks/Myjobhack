"use client";
import { useState } from "react";

export function TrainingBroadcast({ trainingId }: { trainingId: string }) {
  const [openB, setOpenB] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [who, setWho] = useState<string[]>(["registered", "attended", "completed"]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true); setErr(null); setNote(null);
    const res = await fetch("/api/admin/training-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ training_id: trainingId, subject, message, statuses: who })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); return; }
    setNote(`Sent to ${json.sent}/${json.recipients} ✓`);
    setSubject(""); setMessage("");
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-muted">Message participants</div>
        <button className="btn-ghost !h-9 text-xs" onClick={() => setOpenB(!openB)}>{openB ? "Close" : "✉ Compose"}</button>
      </div>
      {openB && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {["registered", "attended", "completed"].map((s) => (
              <button key={s} type="button"
                className={`px-3.5 h-9 rounded-pill border text-xs font-semibold capitalize transition ${
                  who.includes(s) ? "bg-ink border-ink text-white" : "border-line"}`}
                onClick={() => setWho((w) => w.includes(s) ? w.filter((x) => x !== s) : [...w, s])}>{s}</button>
            ))}
          </div>
          <input className="input !h-10 mb-3" placeholder="Subject — e.g. Your joining link for Saturday"
            value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="input !h-auto py-3 mb-3" rows={4}
            placeholder="Your message — session details are attached automatically."
            value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex items-center gap-3">
            <button className="btn-coral !h-10" onClick={send} disabled={busy || !subject || !message}>
              {busy ? "Sending…" : "Send email ✉"}
            </button>
            {note && <span className="text-sm text-muted">{note}</span>}
            {err && <span className="text-sm text-coral">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
