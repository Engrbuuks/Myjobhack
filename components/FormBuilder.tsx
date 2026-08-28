"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Field = {
  id?: string; sort: number; label: string; field_type: string;
  options: string; required: boolean; elig_op: string; elig_value: string;
};
const TYPES = ["text", "textarea", "number", "select", "multiselect", "boolean", "date", "file"];
const OPS: Record<string, string[]> = {
  number: [">=", "<=", ">", "<", "equals"],
  boolean: ["equals"],
  select: ["equals", "in"],
  multiselect: ["contains"],
  text: ["equals", "not_equals"],
  textarea: [], date: [], file: []
};

export function FormBuilder({ jobId, formId, initial }: {
  jobId: string; formId: string | null;
  initial: { id: string; sort: number; label: string; field_type: string; options: string[] | null; required: boolean; eligibility: { op: string; value: any } | null }[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Field[]>(
    initial.map((f) => ({
      id: f.id, sort: f.sort, label: f.label, field_type: f.field_type,
      options: (f.options ?? []).join(", "), required: f.required,
      elig_op: f.eligibility?.op ?? "", elig_value: f.eligibility?.value != null ? String(f.eligibility.value) : ""
    }))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [warn, setWarn] = useState<{ message: string; count: number } | null>(null);

  const add = () => setFields((f) => [...f, {
    sort: f.length, label: "", field_type: "text", options: "", required: true, elig_op: "", elig_value: ""
  }]);
  const remove = (i: number) => setFields((f) => f.filter((_, x) => x !== i));
  const move = (i: number, dir: -1 | 1) => setFields((f) => {
    const n = [...f]; const t = i + dir;
    if (t < 0 || t >= n.length) return f;
    [n[i], n[t]] = [n[t], n[i]];
    return n.map((x, idx) => ({ ...x, sort: idx }));
  });
  const upd = (i: number, k: keyof Field, v: any) =>
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));

  /**
   * Save the form WITHOUT breaking existing applications.
   *
   * This used to delete every field and re-insert them, which handed each
   * question a brand-new UUID on every save. But applications.answers is a
   * jsonb map keyed by field_id — so the moment anyone edited a form, every
   * answer already collected pointed at an id that no longer existed. The
   * applicants page filters answers to known field ids, so those answers
   * silently vanished from the table and the exports. The data was still in
   * the database; only the link to the question was destroyed.
   *
   * Now: existing fields keep their id and are updated in place, new fields
   * get an id generated up front, and only fields you actually removed are
   * deleted — after warning you if answers depend on them.
   */
  async function saveAll(confirmedDelete = false) {
    setBusy(true); setErr(null); setSaved(false); setWarn(null);
    const supabase = createClient();

    // A blank label used to make the field disappear on save, silently
    // deleting a question and orphaning its answers. Refuse instead.
    const blank = fields.findIndex((f) => !f.label.trim());
    if (blank >= 0) {
      setErr(`Question ${blank + 1} has no label. Give it one, or remove the row.`);
      setBusy(false);
      return;
    }

    let fid = formId;
    if (!fid) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: form, error: fe } = await supabase.from("application_forms")
        .insert({ name: "Application form", created_by: user!.id }).select("id").single();
      if (fe) { setErr(fe.message); setBusy(false); return; }
      fid = form.id;
      const { error: je } = await supabase.from("jobs").update({ form_id: fid }).eq("id", jobId);
      if (je) { setErr(je.message); setBusy(false); return; }
    }

    // Which fields did the user actually remove?
    const keptIds = new Set(fields.map((f) => f.id).filter(Boolean) as string[]);
    const removedIds = initial.map((f) => f.id).filter((id) => !keptIds.has(id));

    // Deleting a question throws away answers people already gave. Say so
    // before doing it, rather than after.
    if (removedIds.length && !confirmedDelete) {
      // Applications link to the form through the job, not directly.
      const { data: withAnswers } = await supabase
        .from("applications").select("answers").eq("job_id", jobId).limit(500);
      const affected = (withAnswers ?? []).filter((a: any) =>
        removedIds.some((id) => (a.answers ?? {})[id] != null)).length;
      const labels = initial.filter((f) => removedIds.includes(f.id)).map((f) => f.label);
      setWarn({
        message: affected > 0
          ? `Removing ${labels.join(", ")} will orphan answers from ${affected} applicant${affected === 1 ? "" : "s"}. Those answers stay in the database but stop showing in the table and exports.`
          : `Removing ${labels.join(", ")}. No applicant has answered ${labels.length === 1 ? "it" : "them"} yet, so nothing is lost.`,
        count: affected
      });
      setBusy(false);
      return;
    }

    // Generate ids for new fields up front so the whole set goes in one
    // upsert — existing rows keep their id, new rows get a stable one.
    const rows = fields.map((f, idx) => ({
      id: f.id ?? crypto.randomUUID(),
      form_id: fid, sort: idx, label: f.label.trim(), field_type: f.field_type as any,
      options: ["select", "multiselect"].includes(f.field_type) && f.options.trim()
        ? f.options.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
      required: f.required,
      eligibility: f.elig_op
        ? { op: f.elig_op, value: f.field_type === "number" ? Number(f.elig_value) : f.elig_value }
        : null
    }));

    if (rows.length) {
      const { error } = await supabase.from("form_fields").upsert(rows, { onConflict: "id" });
      if (error) { setErr(error.message); setBusy(false); return; }
    }

    if (removedIds.length) {
      const { error } = await supabase.from("form_fields").delete().in("id", removedIds);
      if (error) { setErr(error.message); setBusy(false); return; }
    }

    // Adopt the saved ids, so a second save in the same session updates
    // rather than inserting duplicates.
    setFields(rows.map((r, idx) => ({
      id: r.id, sort: idx, label: r.label, field_type: r.field_type,
      options: Array.isArray(r.options) ? r.options.join(", ") : "",
      required: r.required,
      elig_op: (r.eligibility as any)?.op ?? "",
      elig_value: (r.eligibility as any)?.value != null ? String((r.eligibility as any).value) : ""
    })));

    setBusy(false); setSaved(true); setWarn(null); router.refresh();
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-bold uppercase tracking-widest text-muted">
          Custom application form {fields.some((f) => f.elig_op) && "· auto-shortlisting ON"}
        </div>
        <button className="btn-ghost !h-9 text-xs" onClick={add}>＋ Add field</button>
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-muted-2 mb-4">
          No custom fields yet — applicants will just submit their profile & resume. Add fields to ask questions, and set a rule on any field to auto-shortlist.
        </p>
      )}

      <div className="space-y-3">
        {fields.map((f, i) => (
          <div key={i} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <span className="w-7 h-7 rounded-full bg-ink text-white grid place-items-center text-xs font-bold shrink-0 mt-1">{i + 1}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button className="w-8 h-8 rounded-lg hover:bg-paper-2 text-muted hover:text-ink transition" onClick={() => move(i, -1)} title="Move up">↑</button>
                <button className="w-8 h-8 rounded-lg hover:bg-paper-2 text-muted hover:text-ink transition" onClick={() => move(i, 1)} title="Move down">↓</button>
                <button className="w-8 h-8 rounded-lg hover:bg-coral-soft text-muted hover:text-coral transition" onClick={() => remove(i)} title="Remove">✕</button>
              </div>
            </div>
            <div className="mb-4">
              <label className="label !text-xs">Question</label>
              <textarea
                className="w-full rounded-xl border border-line px-4 py-3 text-base font-medium resize-y min-h-[56px] focus:border-coral focus:ring-2 focus:ring-coral/20 outline-none transition"
                rows={2}
                placeholder="Type your question — e.g. How many years of hands-on accounting experience do you have?"
                value={f.label} onChange={(e) => upd(i, "label", e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-[180px_auto] gap-3 items-end mb-3">
              <div>
                <label className="label !text-xs">Answer type</label>
                <select className="input !h-11" value={f.field_type}
                  onChange={(e) => { upd(i, "field_type", e.target.value); upd(i, "elig_op", ""); }}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold h-11">
                <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={f.required}
                  onChange={(e) => upd(i, "required", e.target.checked)} /> Required
              </label>
            </div>
            {["select", "multiselect"].includes(f.field_type) && (
              <input className="input !h-11 mb-3" placeholder="Options, comma separated — e.g. Yes, No, Partially"
                value={f.options} onChange={(e) => upd(i, "options", e.target.value)} />
            )}
            {(OPS[f.field_type] ?? []).length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs font-bold uppercase tracking-widest text-muted">Eligibility</span>
                <select className="input !h-9 !w-auto" value={f.elig_op}
                  onChange={(e) => upd(i, "elig_op", e.target.value)}>
                  <option value="">no rule</option>
                  {OPS[f.field_type].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {f.elig_op && (
                  <input className="input !h-9 !w-44" placeholder="value — e.g. 3"
                    value={f.elig_value} onChange={(e) => upd(i, "elig_value", e.target.value)} />
                )}
                {f.elig_op && (
                  <span className="text-xs text-muted-2">fails → not shortlisted</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {warn && (
        <div className="rounded-xl border border-coral/40 p-4 mt-5" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink mb-1">
            {warn.count > 0 ? "This will orphan existing answers" : "Confirm removal"}
          </div>
          <p className="text-sm text-muted mb-3">{warn.message}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-coral !h-9 text-sm" onClick={() => saveAll(true)} disabled={busy}>
              {busy ? "Saving…" : "Remove and save"}
            </button>
            <button className="btn-ghost !h-9 text-sm" onClick={() => setWarn(null)} disabled={busy}>
              Keep the question
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mt-5">
        <button className="btn-coral" onClick={() => saveAll()} disabled={busy || !!warn}>
          {busy ? "Saving…" : "Save form"}
        </button>
        {saved && <span className="text-sm text-muted">Saved ✓</span>}
        {err && <span className="text-sm text-coral">{err}</span>}
      </div>
      <p className="text-xs text-muted-2 mt-3">
        Editing a question keeps the answers already collected against it. Only removing a
        question breaks that link, and you&rsquo;ll be warned first.
      </p>
    </div>
  );
}
