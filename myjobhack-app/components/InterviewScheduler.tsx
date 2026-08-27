"use client";
import { useState, useEffect } from "react";
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
  // Two ways to run an interview, made explicit rather than inferred from
  // whether a date happens to be filled in.
  const [booking, setBooking] = useState<"fixed" | "candidate_picks">("candidate_picks");
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/interview-defaults").then(r => r.json()).then(d => {
      if (d?.booking_url) setCalendly(d.booking_url);
      if (d?.default_meeting_link) setWhere(d.default_meeting_link);
      if (d?.default_mode) setMode(d.default_mode);
      if (d?.default_duration_min) setDuration(String(d.default_duration_min));
      // If no booking link is saved, default to picking a fixed time instead.
      if (!d?.booking_url) setBooking("fixed");
      setDefaultsLoaded(true);
    }).catch(() => setDefaultsLoaded(true));
  }, []);

  async function invite() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/interviews", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application_id: applicationId, mode,
        // Fixed: we set the time. Candidate-picks: they book, so no time yet.
        scheduled_at: booking === "fixed" && when ? new Date(when).toISOString() : null,
        duration_min: Number(duration) || 30,
        location_or_link: where,
        calendly_url: booking === "candidate_picks" ? calendly : "",
        message
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
      {/* Which way this interview is being arranged. Previously this was
          inferred from whether a date happened to be filled in, which was easy
          to get wrong — a stray date silently disabled the booking link. */}
      <div className="mb-3">
        <label className="label">How is the time being set?</label>
        <div className="flex flex-wrap gap-2">
          {[
            ["candidate_picks", "They book a slot", "Send your booking link — you keep control of which slots exist"],
            ["fixed", "I'll set the time", "You choose the exact date and time now"]
          ].map(([key, label, hint]) => (
            <button key={key} type="button" onClick={() => setBooking(key as any)}
              className={`px-3 h-10 rounded-pill text-sm font-semibold border transition ${
                booking === key ? "bg-ink text-white border-ink" : "border-line hover:border-coral"}`}
              title={hint}>{label}</button>
          ))}
        </div>
        <p className="text-xs text-muted-2 mt-1.5">
          {booking === "candidate_picks"
            ? "The candidate picks from the slots you've opened in your booking calendar. You stay in control of availability — they just choose from what you allow."
            : "You name the time. The invite goes out with that exact slot."}
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="label">Format</label>
          <select className="input !h-10" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="video">Video call</option>
            <option value="phone">Phone</option>
            <option value="in_person">In person</option>
          </select>
        </div>
        {booking === "fixed" ? (
          <div>
            <label className="label">Date & time (WAT) <span className="text-coral">*</span></label>
            <input className="input !h-10" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        ) : (
          <div className="sm:col-span-1">
            <label className="label">Booking link <span className="text-coral">*</span></label>
            <input className="input !h-10" placeholder="https://calendly.com/you/30min"
              value={calendly} onChange={(e) => setCalendly(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label">Duration (min)</label>
          <input className="input !h-10" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      </div>

      <div className="mb-3">
        <label className="label">{mode === "in_person" ? "Venue" : "Meeting link (Zoom)"}</label>
        <input className="input !h-10"
          placeholder={mode === "in_person" ? "Office address" : "https://zoom.us/j/… (optional if your booking link sends one)"}
          value={where} onChange={(e) => setWhere(e.target.value)} />
        {booking === "candidate_picks" && (
          <p className="text-xs text-muted-2 mt-1">
            Leave blank if your booking tool generates the Zoom link automatically on booking.
          </p>
        )}
      </div>
      <label className="label">Personal note (goes in the email)</label>
      <textarea className="input !h-auto py-2.5 mb-3" rows={2}
        placeholder="We loved your portfolio — this will be a conversation about…"
        value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex items-center gap-3">
        <button className="btn-coral !h-10" onClick={invite} disabled={busy}>
          {busy ? "Sending…" : "Send invitation ✉"}
        </button>
        <span className="text-xs text-muted-2">The candidate gets an email and an in-app notification.</span>
      </div>
      {err && <p className="text-coral text-sm mt-2">{err}</p>}
    </div>
  );
}
