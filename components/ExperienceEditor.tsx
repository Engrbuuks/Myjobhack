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
