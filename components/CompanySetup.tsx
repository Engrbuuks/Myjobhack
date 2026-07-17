"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Org = { id?: string; name: string; website: string; sector_id: string | null; country: string };

export function CompanySetup({ org, sectors }: {
  org: Org | null; sectors: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [o, setO] = useState<Org>(org ?? { name: "", website: "", sector_id: null, country: "Nigeria" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const set = (k: keyof Org, v: any) => setO((cur) => ({ ...cur, [k]: v }));

  async function save() {
    if (!o.name.trim()) { setErr("Company name is required"); return; }
    setBusy(true); setErr(null); setNote(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (o.id) {
      const { error } = await supabase.from("organizations")
        .update({ name: o.name, website: o.website, sector_id: o.sector_id, country: o.country })
        .eq("id", o.id);
      if (error) { setErr(error.message); setBusy(false); return; }
      setNote("Saved ✓"); setBusy(false); router.refresh();
    } else {
      const { data: created, error } = await supabase.from("organizations")
        .insert({ name: o.name, website: o.website, sector_id: o.sector_id, country: o.country, created_by: user!.id })
        .select("id").single();
      if (error) { setErr(error.message); setBusy(false); return; }
      const { error: mErr } = await supabase.from("org_members")
        .insert({ org_id: created.id, profile_id: user!.id, org_role: "owner" });
      if (mErr) { setErr(mErr.message); setBusy(false); return; }
      router.refresh();
    }
  }

  return (
    <div className="card p-6 max-w-lg">
      <div className="space-y-4">
        <div><label className="label">Company name *</label>
          <input className="input" value={o.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Website</label>
            <input className="input" placeholder="https://…" value={o.website} onChange={(e) => set("website", e.target.value)} /></div>
          <div><label className="label">Country</label>
            <input className="input" value={o.country} onChange={(e) => set("country", e.target.value)} /></div>
        </div>
        <div><label className="label">Sector</label>
          <select className="input" value={o.sector_id ?? ""} onChange={(e) => set("sector_id", e.target.value || null)}>
            <option value="">Select…</option>
            {sectors.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select></div>
      </div>
      <div className="flex items-center gap-4 mt-6">
        <button className="btn-coral" onClick={save} disabled={busy}>
          {busy ? "Saving…" : o.id ? "Save changes" : "Create company →"}
        </button>
        {note && <span className="text-sm text-muted">{note}</span>}
        {err && <span className="text-sm text-coral">{err}</span>}
      </div>
    </div>
  );
}
