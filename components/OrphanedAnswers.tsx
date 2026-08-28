"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { callApi, postJson } from "@/lib/apiClient";

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
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const r = await callApi(`/api/admin/repair-answers?job_id=${jobId}`);
    if (r.ok) {
      setData(r.data);
      setLoadError(null);
      // Seed the selections from the suggestions, so what is shown on screen
      // and what the button will act on are never out of step.
      const seeded: Record<string, string> = {};
      for (const o of (r.data as any)?.orphans ?? []) {
        if (o.suggestions?.[0]?.id) seeded[o.orphaned_field_id] = o.suggestions[0].id;
      }
      setTarget((t) => ({ ...seeded, ...t }));
    }
    // A failure here used to render nothing at all, so a broken route looked
    // identical to "no orphaned answers". Say which it is.
    else setLoadError(r.error);
  }
  useEffect(() => { load(); }, [jobId]);

  /**
   * `to` must fall back to the suggested field.
   *
   * The dropdown DISPLAYED the suggestion via a defaulted value, but that
   * default never reached state — so unless the user opened the dropdown and
   * picked something themselves, target[fromId] was undefined and this
   * function returned silently. The button looked live and did nothing.
   */
  async function repair(fromId: string, suggestedId?: string) {
    const to = target[fromId] ?? suggestedId;
    if (!to) {
      setNote("Choose which question these answers belong to first.");
      return;
    }
    setBusy(fromId); setNote(null);
    let ok = false;
    try {
      const r = await postJson("/api/admin/repair-answers", {
        job_id: jobId, from_field_id: fromId, to_field_id: to
      });
      ok = r.ok;
      setNote(r.ok ? (r.data?.message ?? "Done.") : r.error);
    } finally {
      setBusy(null);
    }
    load();
    if (ok) setTimeout(() => router.refresh(), 1200);
  }

  if (loadError) {
    return (
      <div className="card p-4 mb-4 border-coral/40" style={{ background: "#FFF4F2" }}>
        <div className="font-semibold text-sm text-ink mb-1">Couldn&rsquo;t check for stranded answers</div>
        <p className="text-sm text-muted">{loadError}</p>
      </div>
    );
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
              onClick={() => repair(o.orphaned_field_id, o.suggestions[0]?.id)}
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
