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

  async function saveAll() {
    setBusy(true); setErr(null); setSaved(false);
    const supabase = createClient();
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
    // wipe & rewrite (simple, atomic enough for admin editing)
    await supabase.from("form_fields").delete().eq("form_id", fid);
    const rows = fields
      .filter((f) => f.label.trim())
      .map((f, idx) => ({
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
      const { error } = await supabase.from("form_fields").insert(rows);
      if (error) { setErr(error.message); setBusy(false); return; }
    }
    setBusy(false); setSaved(true); router.refresh();
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
          <div key={i} className="rounded-xl border border-line p-4">
            <div className="grid sm:grid-cols-[1fr_140px_auto] gap-3 mb-3">
              <input className="input !h-10" placeholder="Question label — e.g. Years of accounting experience"
                value={f.label} onChange={(e) => upd(i, "label", e.target.value)} />
              <select className="input !h-10" value={f.field_type}
                onChange={(e) => { upd(i, "field_type", e.target.value); upd(i, "elig_op", ""); }}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  <input type="checkbox" className="accent-[#FC5647]" checked={f.required}
                    onChange={(e) => upd(i, "required", e.target.checked)} /> req
                </label>
                <button className="text-muted hover:text-ink px-1" onClick={() => move(i, -1)}>↑</button>
                <button className="text-muted hover:text-ink px-1" onClick={() => move(i, 1)}>↓</button>
                <button className="text-muted hover:text-coral px-1" onClick={() => remove(i)}>✕</button>
              </div>
            </div>
            {["select", "multiselect"].includes(f.field_type) && (
              <input className="input !h-10 mb-3" placeholder="Options, comma separated — e.g. Yes, No, Partially"
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

      <div className="flex items-center gap-4 mt-5">
        <button className="btn-coral" onClick={saveAll} disabled={busy}>
          {busy ? "Saving…" : "Save form"}
        </button>
        {saved && <span className="text-sm text-muted">Saved ✓</span>}
        {err && <span className="text-sm text-coral">{err}</span>}
      </div>
    </div>
  );
}
