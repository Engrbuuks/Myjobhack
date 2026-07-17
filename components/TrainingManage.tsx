"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function TrainingSettings({ training, courses }: {
  training: { id: string; status: string; course_id: string | null; delivery: string; starts_at: string | null; location_or_link: string | null };
  courses: { id: string; title: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState(training.status);
  const [courseId, setCourseId] = useState(training.course_id ?? "");
  const [startsAt, setStartsAt] = useState(training.starts_at?.slice(0, 16) ?? "");
  const [where, setWhere] = useState(training.location_or_link ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true); setNote(null);
    const { error } = await supabase.from("trainings").update({
      status: status as any, course_id: courseId || null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      location_or_link: where
    }).eq("id", training.id);
    setBusy(false); setNote(error ? error.message : "Saved ✓");
    router.refresh();
  }

  return (
    <div className="card p-6">
      <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Training settings</div>
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div><label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {["draft", "open", "in_progress", "completed", "cancelled"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select></div>
        <div><label className="label">Starts</label>
          <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div><label className="label">Link / venue</label>
          <input className="input" value={where} onChange={(e) => setWhere(e.target.value)} /></div>
        {training.delivery === "lms" && (
          <div><label className="label">Attached LMS course</label>
            <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">None</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select></div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <button className="btn-coral" onClick={save} disabled={busy}>Save</button>
        {note && <span className="text-sm text-muted">{note}</span>}
      </div>
    </div>
  );
}

export function EnrollmentRow({ e }: {
  e: { id: string; status: string; name: string; email: string };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function set(status: string) {
    setBusy(true);
    await supabase.from("enrollments").update({
      status: status as any,
      attended_at: status === "attended" ? new Date().toISOString() : undefined,
      completed_at: status === "completed" ? new Date().toISOString() : undefined
    }).eq("id", e.id);
    setBusy(false); router.refresh();
  }

  return (
    <div className="flex items-center gap-4 border border-line rounded-xl px-4 py-3">
      <div className="flex-1">
        <div className="font-semibold text-sm">{e.name}</div>
        <div className="text-xs text-muted-2">{e.email}</div>
      </div>
      <span className="px-2.5 py-1 rounded-pill text-xs font-bold capitalize bg-paper-2 text-muted">
        {e.status}
      </span>
      {e.status === "registered" && (
        <button className="btn-ghost !h-9 text-xs" disabled={busy} onClick={() => set("attended")}>Mark attended</button>
      )}
      {["registered", "attended"].includes(e.status) && (
        <button className="btn-coral !h-9 text-xs" disabled={busy} onClick={() => set("completed")}>Mark completed ✓</button>
      )}
    </div>
  );
}
