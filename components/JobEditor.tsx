"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloneJobButton } from "@/components/CloneJobButton";
import { LogoUpload } from "@/components/LogoUpload";
import { JobComposer, type ComposedJob } from "@/components/JobComposer";
import { createClient } from "@/lib/supabase/client";
import { DeleteButton } from "@/components/DeleteButton";

type Tax = { id: string; label: string };
type Job = {
  id?: string; title: string; description: string; location: string;
  work_mode: string | null; role_level: string | null; employment_type: string;
  salary_note: string; salary_currency?: string; niche_id: string | null; status: string; key_requirements?: string[]; is_featured?: boolean; featured_rank?: number | null; company_name?: string | null; company_logo_path?: string | null; company_website?: string | null;
  closes_at: string | null; external_url: string | null;
};

const MODES = ["remote", "hybrid", "onsite", "flexible"];
const LEVELS = ["entry", "junior", "mid", "senior", "lead", "executive"];
const TYPES = ["full_time", "part_time", "contract", "internship", "temporary"];

export function JobEditor({ job, niches, orgId, basePath = "/portal/admin/jobs" }: { job: Job | null; niches: Tax[]; orgId?: string | null; basePath?: string }) {
  const router = useRouter();
  const [j, setJ] = useState<Job>(job ?? {
    title: "", description: "", location: "", work_mode: null, role_level: null,
    employment_type: "full_time", salary_note: "", salary_currency: "NGN", niche_id: null, key_requirements: [], is_featured: false, featured_rank: null, company_name: null, company_logo_path: null, company_website: null,
    status: "draft", closes_at: null, external_url: null
  });
  const [busy, setBusy] = useState(false);
  const [pendingQuestions, setPendingQuestions] = useState<any[] | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Job, v: any) => setJ((cur) => ({ ...cur, [k]: v }));

  // datetime-local needs local time, not UTC — this was silently shifting dates
  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const humanUntil = (iso: string) => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "already past";
    const days = Math.floor(ms / 86400000);
    const hrs = Math.floor((ms % 86400000) / 3600000);
    return days > 0 ? `${days} day${days === 1 ? "" : "s"} ${hrs}h` : `${hrs} hour${hrs === 1 ? "" : "s"}`;
  };
  const deadlinePast = !!j.closes_at && new Date(j.closes_at) <= new Date();

  function applyDraft(d: ComposedJob, opts: { questions: boolean }) {
    setJ((cur) => ({
      ...cur,
      description: d.description || cur.description,
      key_requirements: (d.key_requirements ?? []).filter(Boolean),
      role_level: d.role_level || cur.role_level,
      employment_type: d.employment_type || cur.employment_type,
      work_mode: d.work_mode || cur.work_mode,
      niche_id: d.niche_id ?? cur.niche_id,
      salary_note: d.salary_note || cur.salary_note,
      salary_currency: d.salary_currency || cur.salary_currency || "NGN"
    }));
    setPendingQuestions(opts.questions ? (d.screening_questions ?? []) : null);
    setAiNote(
      opts.questions && (d.screening_questions ?? []).length
        ? `Draft applied. ${d.screening_questions.length} screening questions will be added to the application form when you save.`
        : "Draft applied — review the fields below, then save."
    );
  }

  async function save() {
    // A deadline already behind us would hide the role the moment it publishes.
    if (j.closes_at && new Date(j.closes_at) <= new Date()) {
      setErr("That application deadline is already in the past — the role would be hidden immediately. Pick a future date, or clear the field for no deadline.");
      return;
    }
    if (!j.title.trim()) { setErr("Title is required"); return; }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      title: j.title, description: j.description, location: j.location,
      work_mode: j.work_mode as any, role_level: j.role_level as any,
      employment_type: j.employment_type as any, salary_note: j.salary_note, salary_currency: j.salary_currency || "NGN",
      key_requirements: (j.key_requirements ?? []).filter((r: string) => r.trim()),
      company_name: j.company_name || null,
      company_logo_path: j.company_logo_path || null,
      company_website: j.company_website || null,
      is_featured: !!j.is_featured,
      featured_rank: j.featured_rank ?? null,
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
      if (pendingQuestions?.length) {
        try {
          await fetch("/api/jobs/apply-draft", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: j.id, questions: pendingQuestions, title: j.title })
          });
          setPendingQuestions(null);
        } catch {}
      }
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
      if (pendingQuestions?.length) {
        try {
          await fetch("/api/jobs/apply-draft", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: data.id, questions: pendingQuestions, title: j.title })
          });
        } catch {}
      }
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

        <JobComposer title={j.title} company={j.company_name} location={j.location} onApply={applyDraft} />
        {aiNote && (
          <div className="rounded-xl bg-ink text-white px-4 py-3 text-sm flex items-start gap-3">
            <span className="text-coral">✦</span>
            <span className="flex-1">{aiNote}</span>
            <button type="button" className="text-white/40 hover:text-white" onClick={() => setAiNote(null)}>✕</button>
          </div>
        )}

        <div><label className="label">Description / JD</label>
          <textarea className="input !h-auto py-3" rows={8}
            placeholder="Paste the full job description — this powers the AI fit scoring."
            value={j.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Location</label>
            <input className="input" placeholder="Lagos · Nigeria" value={j.location} onChange={(e) => set("location", e.target.value)} /></div>
          <div><label className="label">Salary note</label>
            <div className="flex gap-2">
              <select className="input !w-28 shrink-0" value={j.salary_currency || "NGN"}
                onChange={(e) => set("salary_currency", e.target.value)}>
                <option value="NGN">₦ NGN</option>
                <option value="USD">$ USD</option>
                <option value="GBP">£ GBP</option>
                <option value="EUR">€ EUR</option>
                <option value="GHS">GH₵ GHS</option>
                <option value="KES">KSh KES</option>
                <option value="ZAR">R ZAR</option>
              </select>
              <input className="input" placeholder="450k–600k / month" value={j.salary_note}
                onChange={(e) => set("salary_note", e.target.value)} />
            </div>
            <p className="text-xs text-muted-2 mt-1">The symbol is added automatically — just type the figures.</p></div>

          <div className="sm:col-span-2">
            <label className="label">Application deadline</label>
            <div className="flex gap-2">
              <input className={`input ${deadlinePast ? "!border-coral" : ""}`} type="datetime-local"
                min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                value={j.closes_at ? toLocalInput(j.closes_at) : ""}
                onChange={(e) => set("closes_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              {j.closes_at && (
                <button type="button" className="btn-ghost !h-11 !px-4 shrink-0"
                  onClick={() => set("closes_at", null)}>Clear</button>
              )}
            </div>
            {deadlinePast ? (
              <p className="text-xs text-coral mt-1.5 font-semibold">
                ⚠ This date has already passed — the role would be hidden from every listing straight away.
                Pick a future date or clear it.
              </p>
            ) : j.closes_at ? (
              <p className="text-xs text-muted-2 mt-1.5">
                Closes {new Date(j.closes_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })} —
                that's {humanUntil(j.closes_at)} from now. A live countdown shows on the card.
              </p>
            ) : (
              <p className="text-xs text-muted-2 mt-1.5">
                No deadline — the role stays listed until you close it. Set one and a countdown appears on the card.
              </p>
            )}
          </div>
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
          <div className="sm:col-span-2 rounded-xl border border-line p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-2 mb-3">Hiring company</div>
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">Company name</label>
                <input className="input" placeholder="Leave blank to use your organisation"
                  value={j.company_name ?? ""} onChange={(e) => set("company_name", e.target.value || null)} />
              </div>
              <div>
                <label className="label">Company website</label>
                <input className="input" placeholder="https://…"
                  value={j.company_website ?? ""} onChange={(e) => set("company_website", e.target.value || null)} />
              </div>
            </div>
            <LogoUpload value={j.company_logo_path ?? null} onChange={(p) => set("company_logo_path", p)} />
            <p className="text-xs text-muted-2 mt-2">
              Set these when posting on behalf of a client that has no account yet. Otherwise your organisation's name and logo are used.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label">Key requirements <span className="text-muted-2 font-normal">— the non-negotiables</span></label>
            <div className="space-y-2">
              {(j.key_requirements ?? []).map((req, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input" value={req} placeholder="e.g. 3+ years managing paid social campaigns"
                    onChange={(e) => set("key_requirements", (j.key_requirements ?? []).map((r, ri) => ri === i ? e.target.value : r))} />
                  <button className="btn-ghost !h-11 !px-3 shrink-0"
                    onClick={() => set("key_requirements", (j.key_requirements ?? []).filter((_, ri) => ri !== i))}>✕</button>
                </div>
              ))}
            </div>
            <button className="btn-ghost !h-9 text-xs mt-2"
              onClick={() => set("key_requirements", [...(j.key_requirements ?? []), ""])}>＋ Add requirement</button>
            <p className="text-xs text-muted-2 mt-1">Shown prominently on the job card and page. Keep them to what genuinely disqualifies.</p>
          </div>

          <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-line p-4 cursor-pointer hover:border-coral transition">
            <input type="checkbox" className="mt-1" checked={!!j.is_featured}
              onChange={(e) => set("is_featured", e.target.checked)} />
            <span className="flex-1">
              <span className="block text-sm font-semibold">Feature on the website homepage</span>
              <span className="block text-xs text-muted-2 mt-0.5">Only featured roles appear in the homepage strip. Everything published still shows on the Jobs page and /roles.</span>
            </span>
            {j.is_featured && (
              <input className="input !w-20 !h-9 shrink-0" type="number" placeholder="#" title="Order"
                value={j.featured_rank ?? ""} onChange={(e) => set("featured_rank", e.target.value ? Number(e.target.value) : null)} />
            )}
          </label>

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
          <span className="ml-auto flex items-center gap-4">
            <CloneJobButton jobId={j.id} basePath={basePath} />
            <DeleteButton action="delete_job" id={j.id} label="Delete job"
              confirmLabel="Delete job + applications" redirect={basePath} />
          </span>
        )}
      </div>
    </div>
  );
}
