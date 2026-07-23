"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Defaults = {
  booking_url: string; default_mode: string;
  default_duration_min: number; default_meeting_link: string;
};

/**
 * Saved interview defaults. Without these, the booking link had to be pasted
 * into every single invitation.
 */
export function InterviewSettings({ initial }: { initial: Defaults }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  async function save() {
    setBusy(true); setNote(null); setBad(false);
    const res = await fetch("/api/admin/interview-defaults", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f)
    });
    const j = await res.json();
    setBusy(false);
    if (res.ok) { setNote("Saved."); setTimeout(() => setNote(null), 2500); router.refresh(); }
    else { setNote(j.error ?? "Could not save."); setBad(true); }
  }

  return (
    <div className="card p-5">
      <div className="font-display font-semibold mb-1">Interviews</div>
      <p className="text-sm text-muted-2 mb-4">
        Set your booking link once and it pre-fills every invitation. You keep control of
        availability — candidates only ever choose from slots you've opened.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label !text-xs">Booking link (Calendly, Cal.com, etc.)</label>
          <input className="input !h-10" placeholder="https://calendly.com/yourjobhacks/30min"
            value={f.booking_url} onChange={(e) => setF({ ...f, booking_url: e.target.value })} />
          <p className="text-xs text-muted-2 mt-1">Candidates pick from the slots you allow.</p>
        </div>
        <div>
          <label className="label !text-xs">Standing meeting link (optional)</label>
          <input className="input !h-10" placeholder="https://zoom.us/j/1234567890"
            value={f.default_meeting_link} onChange={(e) => setF({ ...f, default_meeting_link: e.target.value })} />
          <p className="text-xs text-muted-2 mt-1">Leave blank if your booking tool creates one per meeting.</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="label !text-xs">Default format</label>
          <select className="input !h-10" value={f.default_mode}
            onChange={(e) => setF({ ...f, default_mode: e.target.value })}>
            <option value="video">Video call</option>
            <option value="phone">Phone</option>
            <option value="in_person">In person</option>
          </select>
        </div>
        <div>
          <label className="label !text-xs">Default duration (min)</label>
          <input className="input !h-10" type="number" value={f.default_duration_min}
            onChange={(e) => setF({ ...f, default_duration_min: Number(e.target.value) || 30 })} />
        </div>
        <button className="btn-coral !h-10" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save interview defaults"}
        </button>
      </div>

      {note && (
        <p className={`text-sm font-semibold mt-3 ${bad ? "text-coral" : "text-ink"}`}>{note}</p>
      )}
    </div>
  );
}
