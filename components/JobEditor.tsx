"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DeleteButton } from "@/components/DeleteButton";

type Tax = { id: string; label: string };
type Job = {
  id?: string; title: string; description: string; location: string;
  work_mode: string | null; role_level: string | null; employment_type: string;
  salary_note: string; niche_id: string | null; status: string;
  closes_at: string | null; external_url: string | null;
};

const MODES = ["remote", "hybrid", "onsite", "flexible"];
const LEVELS = ["entry", "junior", "mid", "senior", "lead", "executive"];
const TYPES = ["full_time", "part_time", "contract", "internship", "temporary"];

export function JobEditor({ job, niches, orgId, basePath = "/portal/admin/jobs" }: { job: Job | null; niches: Tax[]; orgId?: string | null; basePath?: string }) {
  const router = useRouter();
  const [j, setJ] = useState<Job>(job ?? {
    title: "", description: "", location: "", work_mode: null, role_level: null,
    employment_type: "full_time", salary_note: "", niche_id: null,
    status: "draft", closes_at: null, external_url: null
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Job, v: any) => setJ((cur) => ({ ...cur, [k]: v }));

  async function save() {
    if (!j.title.trim()) { setErr("Title is required"); return; }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      title: j.title, description: j.description, location: j.location,
      work_mode: j.work_mode as any, role_level: j.role_level as any,
      employment_type: j.employment_type as any, salary_note: j.salary_note,
      niche_id: j.niche_id, status: j.status as any,
      closes_at: j.closes_at || null, external_url: j.external_url || null,
    };
    if (j.id) {
      // set published_at the first time it goes live; never overwrite it afterwards
      const { data: existing } = await supabase.from("jobs").select("published_at").eq("id", j.id).single();
      const updatePayload: any = { ...payload };
      if (j.status === "published" && !existing?.published_at) {
        updatePayload.published_at = new Date().toISOString();
      } else if (j.status !== "published") {
        updatePayload.published_at = null;
      }
      const { error } = await supabase.from("jobs").update(updatePayload).eq("id", j.id);
      if (error) { setErr(error.message); setBusy(false); return; }
      try {
        await fetch("/api/revalidate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: j.id })
        });
      } catch {}
      router.refresh(); setBusy(false);
    } else {
      const { data, error } = await supabase.from("jobs")
        .insert({ ...payload, published_at: j.status === "published" ? new Date().toISOString() : null, posted_by: user!.id, org_id: orgId ?? null }).select("id").single();
      if (error) { setErr(error.message); setBusy(false); return; }
      try {
        await fetch("/api/revalidate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: data.id })
        });
      } catch {}
      router.push(`${basePath}/${data.id}`);
    }
  }

  const sel = (k: keyof Job, opts: string[], placeholder: string) => (
    <select className="input" value={(j[k] as string) ?? ""} onChange={(e) => set(k, e.target.value || null)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
    </select>
  );

  return (
    <div className="card p-6 max-w-2xl">
      <div className="space-y-4">
        <div><label className="label">Job title *</label>
          <input className="input" value={j.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div><label className="label">Description / JD</label>
          <textarea className="input !h-auto py-3" rows={8}
            placeholder="Paste the full job description — this powers the AI fit scoring."
            value={j.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Location</label>
            <input className="input" placeholder="Lagos · Nigeria" value={j.location} onChange={(e) => set("location", e.target.value)} /></div>
          <div><label className="label">Salary note</label>
            <input className="input" placeholder="₦450k–₦600k / month" value={j.salary_note} onChange={(e) => set("salary_note", e.target.value)} /></div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label className="label">Work mode</label>{sel("work_mode", MODES, "Select…")}</div>
          <div><label className="label">Role level</label>{sel("role_level", LEVELS, "Select…")}</div>
          <div><label className="label">Type</label>{sel("employment_type", TYPES, "Select…")}</div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label className="label">Niche</label>
            <select className="input" value={j.niche_id ?? ""} onChange={(e) => set("niche_id", e.target.value || null)}>
              <option value="">Select…</option>
              {niches.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select></div>
          <div><label className="label">Closes</label>
            <input className="input" type="date" value={j.closes_at?.slice(0, 10) ?? ""}
              onChange={(e) => set("closes_at", e.target.value || null)} /></div>
          <div><label className="label">Status</label>
            <select className="input" value={j.status} onChange={(e) => set("status", e.target.value)}>
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="closed">closed</option>
              <option value="archived">archived</option>
            </select></div>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-6">
        <button className="btn-coral" onClick={save} disabled={busy}>
          {busy ? "Saving…" : j.id ? "Save changes" : "Create job →"}
        </button>
        {err && <span className="text-coral text-sm">{err}</span>}
        {j.id && (
          <span className="ml-auto">
            <DeleteButton action="delete_job" id={j.id} label="Delete job"
              confirmLabel="Delete job + applications" redirect={basePath} />
          </span>
        )}
      </div>
    </div>
  );
}
