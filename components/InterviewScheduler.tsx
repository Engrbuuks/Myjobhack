"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function InterviewScheduler({ applicationId, onDone }: {
  applicationId: string; onDone?: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState("video");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("30");
  const [where, setWhere] = useState("");
  const [calendly, setCalendly] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function invite() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/interviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: applicationId, mode,
        scheduled_at: when ? new Date(when).toISOString() : null,
        duration_min: Number(duration) || 30,
        location_or_link: where, calendly_url: calendly, message
      })
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(json.error); return; }
    setSent(true); router.refresh(); onDone?.();
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-paper border border-line p-4 text-sm flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-ink text-white grid place-items-center text-xs">✓</span>
        Invitation sent — email + in-app notification delivered. Status moved to <b>interviewing</b>.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line p-4 bg-paper">
      <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-3">Invite to interview</div>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="label">Format</label>
          <select className="input !h-10" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="video">Video call</option>
            <option value="phone">Phone</option>
            <option value="in_person">In person</option>
          </select>
        </div>
        <div>
          <label className="label">Date & time (WAT)</label>
          <input className="input !h-10" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div>
          <label className="label">Duration (min)</label>
          <input className="input !h-10" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">{mode === "in_person" ? "Venue" : "Meeting link (Zoom/Meet)"}</label>
          <input className="input !h-10" placeholder={mode === "in_person" ? "Office address" : "https://meet.google.com/…"}
            value={where} onChange={(e) => setWhere(e.target.value)} />
        </div>
        <div>
          <label className="label">Or Calendly link — candidate picks the time</label>
          <input className="input !h-10" placeholder="https://calendly.com/you/interview"
            value={calendly} onChange={(e) => setCalendly(e.target.value)} />
        </div>
      </div>
      <label className="label">Personal note (goes in the email)</label>
      <textarea className="input !h-auto py-2.5 mb-3" rows={2}
        placeholder="We loved your portfolio — this will be a conversation about…"
        value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex items-center gap-3">
        <button className="btn-coral !h-10" onClick={invite} disabled={busy}>
          {busy ? "Sending…" : "Send invitation ✉"}
        </button>
        <span className="text-xs text-muted-2">Leave the time empty if you're using Calendly.</span>
      </div>
      {err && <p className="text-coral text-sm mt-2">{err}</p>}
    </div>
  );
}
