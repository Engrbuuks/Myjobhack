"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Exp = {
  id: string; title: string; company: string; employment_type: string;
  start_date: string | null; end_date: string | null; is_current: boolean;
  location: string | null; summary: string | null; sort: number;
};

const TYPES = ["full_time", "part_time", "contract", "internship", "temporary"];

export function ExperienceEditor({ initial }: { initial: Exp[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<Exp[]>(initial);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [suggested, setSuggested] = useState<Exp[] | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string>("medium");

  /** Read the uploaded résumé and propose entries — never writes directly. */
  async function importFromResume() {
    setImporting(true); setImportErr(null); setImportNote(null); setSuggested(null);
    try {
      const res = await fetch("/api/ai/parse-resume", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setImportErr([j.error, j.hint].filter(Boolean).join(" "));
        setImporting(false); return;
      }
      if (!j.experiences?.length) {
        setImportErr("We read your résumé but couldn't find any work roles in it. Add them manually below.");
        setImporting(false); return;
      }
      setSuggested(j.experiences.map((e: any, i: number) => ({
        id: `import-${Date.now()}-${i}`, ...e, sort: rows.length + i
      })));
      setConfidence(j.confidence ?? "medium");
      setImportNote(j.note ?? null);
    } catch {
      setImportErr("Something went wrong reading your résumé.");
    }
    setImporting(false);
  }

  /** Add the confirmed suggestions into the editable list. */
  function acceptSuggestions(picked: Exp[]) {
    setRows([...rows, ...picked]);
    setSuggested(null); setImportNote(null);
  }

  function blank(): Exp {
    return { id: `new-${Date.now()}`, title: "", company: "", employment_type: "full_time",
      start_date: null, end_date: null, is_current: false, location: null, summary: null, sort: rows.length };
  }
  function update(i: number, patch: Partial<Exp>) { setRows(rows.map((r, j) => j === i ? { ...r, ...patch } : r)); }
  function add() { setRows([...rows, blank()]); }
  function remove(i: number) { setRows(rows.filter((_, j) => j !== i)); }

  async function save() {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }

    // Upsert current rows, delete removed ones.
    const existingIds = initial.map((r) => r.id);
    const keptIds = rows.filter((r) => !r.id.startsWith("new-")).map((r) => r.id);
    const toDelete = existingIds.filter((id) => !keptIds.includes(id));
    if (toDelete.length) await supabase.from("work_experiences").delete().in("id", toDelete);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const payload = {
        talent_id: user.id, title: r.title, company: r.company, employment_type: r.employment_type as any,
        start_date: r.start_date || null, end_date: r.is_current ? null : (r.end_date || null),
        is_current: r.is_current, location: r.location || null, summary: r.summary || null, sort: i
      };
      if (r.id.startsWith("new-")) await supabase.from("work_experiences").insert(payload);
      else await supabase.from("work_experiences").update(payload).eq("id", r.id);
    }
    setBusy(false); router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Import from résumé — the biggest drop-off on the platform is asking
          people to retype what is already in a document they uploaded. */}
      {!suggested && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48">
              <div className="font-semibold text-sm">Fill this in from your résumé</div>
              <p className="text-xs text-muted-2 mt-0.5">
                We'll read the roles out of the file you uploaded. You review everything before it's saved.
              </p>
            </div>
            <button className="btn-coral !h-10 text-sm shrink-0" onClick={importFromResume} disabled={importing}>
              {importing ? "Reading your résumé…" : "✦ Import from résumé"}
            </button>
          </div>
          {importErr && <p className="text-xs text-coral mt-2 leading-relaxed">{importErr}</p>}
        </div>
      )}

      {/* Review step — suggestions are never written silently. */}
      {suggested && (
        <div className="card p-5 border-coral/40">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <div className="font-display font-semibold text-lg">
                Found {suggested.length} role{suggested.length === 1 ? "" : "s"} in your résumé
              </div>
              <p className="text-sm text-muted-2 mt-0.5">
                Check these before adding them. Employers evaluate this section, so it's worth getting right.
              </p>
            </div>
            {confidence !== "high" && (
              <span className="px-2 py-1 rounded-pill bg-paper-2 text-[10px] font-bold uppercase tracking-wider text-muted-2 shrink-0">
                {confidence} confidence
              </span>
            )}
          </div>
          {importNote && <p className="text-xs text-muted-2 mb-3 italic">{importNote}</p>}

          <div className="space-y-2 my-4">
            {suggested.map((sg, i) => (
              <div key={sg.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="accent-[#FC5647] w-4 h-4 mt-1 shrink-0"
                    defaultChecked
                    onChange={(e) => {
                      const next = [...suggested];
                      (next[i] as any)._skip = !e.target.checked;
                      setSuggested(next);
                    }} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">
                      {sg.title || <span className="text-coral">No title found</span>}
                      {sg.company && <span className="text-muted-2 font-normal"> · {sg.company}</span>}
                    </div>
                    <div className="text-xs text-muted-2">
                      {sg.start_date ? sg.start_date.slice(0, 7) : "start date not found"}
                      {" — "}
                      {sg.is_current ? "Present" : sg.end_date ? sg.end_date.slice(0, 7) : "end date not found"}
                      {sg.location && ` · ${sg.location}`}
                    </div>
                    {sg.summary && <p className="text-xs text-muted-2 mt-1 leading-relaxed">{sg.summary}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-coral !h-10 text-sm"
              onClick={() => acceptSuggestions(suggested.filter((x: any) => !x._skip))}>
              Add these to my profile
            </button>
            <button className="btn-ghost !h-10 text-sm" onClick={() => { setSuggested(null); setImportNote(null); }}>
              Discard
            </button>
            <span className="text-xs text-muted-2 self-center">
              You can edit every field afterwards — nothing is saved until you press Save.
            </span>
          </div>
        </div>
      )}

      {rows.map((r, i) => (
        <div key={r.id} className="card p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label !text-xs">Job title</label>
              <input className="input !h-10" value={r.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="e.g. Senior Accountant" /></div>
            <div><label className="label !text-xs">Company</label>
              <input className="input !h-10" value={r.company} onChange={(e) => update(i, { company: e.target.value })} placeholder="e.g. Dangote Group" /></div>
          </div>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div><label className="label !text-xs">Type</label>
              <select className="input !h-10" value={r.employment_type} onChange={(e) => update(i, { employment_type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select></div>
            <div><label className="label !text-xs">Start</label>
              <input className="input !h-10" type="month" value={r.start_date?.slice(0, 7) ?? ""} onChange={(e) => update(i, { start_date: e.target.value ? `${e.target.value}-01` : null })} /></div>
            <div><label className="label !text-xs">End</label>
              <input className="input !h-10" type="month" disabled={r.is_current} value={r.end_date?.slice(0, 7) ?? ""} onChange={(e) => update(i, { end_date: e.target.value ? `${e.target.value}-01` : null })} /></div>
            <label className="flex items-center gap-2 text-sm font-semibold h-10">
              <input type="checkbox" className="accent-[#FC5647] w-4 h-4" checked={r.is_current} onChange={(e) => update(i, { is_current: e.target.checked })} /> Current
            </label>
          </div>
          <div><label className="label !text-xs">What you did (shown to employers)</label>
            <textarea className="input !h-auto py-2" rows={2} value={r.summary ?? ""} onChange={(e) => update(i, { summary: e.target.value })} placeholder="Key responsibilities and achievements — no contact details." /></div>
          <div className="flex justify-end">
            <button className="text-muted-2 hover:text-coral text-sm" onClick={() => remove(i)}>Remove</button>
          </div>
        </div>
      ))}
      <div className="flex gap-3">
        <button className="btn-ghost" onClick={add}>+ Add experience</button>
        <button className="btn-coral" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save experience"}</button>
      </div>
    </div>
  );
}
