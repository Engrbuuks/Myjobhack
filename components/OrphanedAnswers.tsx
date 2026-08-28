"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Answers stranded by past form edits, and a way to put them back.
 *
 * Only rendered when there is something stranded — a permanent empty panel on
 * every job would be noise.
 */
export function OrphanedAnswers({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({});

  async function load() {
    const r = await fetch(`/api/admin/repair-answers?job_id=${jobId}`);
    if (r.ok) setData(await r.json());
  }
  useEffect(() => { load(); }, [jobId]);

  async function repair(fromId: string) {
    const to = target[fromId];
    if (!to) return;
    setBusy(fromId); setNote(null);
    const r = await fetch("/api/admin/repair-answers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, from_field_id: fromId, to_field_id: to })
    });
    const j = await r.json();
    setNote(r.ok ? j.message : (j.error ?? "Could not restore those answers."));
    setBusy(null);
    load();
    if (r.ok) setTimeout(() => router.refresh(), 1200);
  }

  if (!data || !data.orphans?.length) return null;

  return (
    <div className="card p-5 mb-4 border-coral/40" style={{ background: "#FFF4F2" }}>
      <h3 className="font-display font-semibold text-lg">Answers that stopped showing</h3>
      <p className="text-sm text-muted mt-1 mb-4">
        {data.message} This happened when the form was edited: the question was re-created with a
        new id, so answers already collected lost their link to it. The answers were never deleted.
        Match each one to the question it belongs to and they come back.
      </p>

      {data.orphans.map((o: any) => (
        <div key={o.orphaned_field_id} className="rounded-xl bg-white border border-line p-4 mb-3">
          <div className="flex flex-wrap items-baseline gap-2 mb-2">
            <strong className="text-ink">{o.applicants} answer{o.applicants === 1 ? "" : "s"}</strong>
            <span className="text-sm text-muted-2">
              — {o.values.map((v: any) => `${v.value} (${v.count})`).join(", ")}
            </span>
          </div>

          {o.suggestions.length > 0 && (
            <p className="text-xs text-muted mb-2">
              Likely: <strong>{o.suggestions.map((s: any) => s.label).join(" or ")}</strong> — every
              stranded value is one of that question&rsquo;s options.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select className="input !h-9 !w-auto text-sm"
              value={target[o.orphaned_field_id] ?? o.suggestions[0]?.id ?? ""}
              onChange={(e) => setTarget({ ...target, [o.orphaned_field_id]: e.target.value })}>
              <option value="">Which question is this?</option>
              {data.live_fields.map((f: any) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <button className="btn-coral !h-9 text-sm"
              onClick={() => repair(o.orphaned_field_id)}
              disabled={busy === o.orphaned_field_id ||
                !(target[o.orphaned_field_id] ?? o.suggestions[0]?.id)}>
              {busy === o.orphaned_field_id ? "Restoring…" : "Restore these answers"}
            </button>
          </div>
        </div>
      ))}

      {note && <p className="text-sm font-medium text-ink mt-2">{note}</p>}
      <p className="text-xs text-muted-2 mt-3">
        Nobody&rsquo;s existing answer is overwritten. If an applicant answered the live question
        too, theirs is kept and the stranded one is left alone.
      </p>
    </div>
  );
}
