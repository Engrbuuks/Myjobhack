import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ApplicantTable } from "@/components/ApplicantTable";
import { ApplicantCharts } from "@/components/ApplicantCharts";
import { buildCandidateCard } from "@/lib/candidateCard";

export const dynamic = "force-dynamic";

export default async function RecruiterShortlists({ searchParams }: { searchParams: { job?: string } }) {
  const admin = createAdminClient();

  // Jobs to choose from
  const { data: jobs } = await admin.from("jobs")
    .select("id, title, company_name, status").eq("status", "published")
    .order("created_at", { ascending: false }).limit(60);

  const jobId = searchParams.job ?? (jobs?.[0]?.id ?? null);
  const job = (jobs ?? []).find((j) => j.id === jobId) ?? null;

  let rows: any[] = [];
  let formFields: { id: string; label: string; type: string }[] = [];
  if (jobId) {
    const { data: apps } = await admin.from("applications").select("*").eq("job_id", jobId)
      .order("ai_fit_score", { ascending: false, nullsFirst: false });

    const { data: form } = await admin.from("jobs").select("form_id").eq("id", jobId).maybeSingle();
    const fieldMap = new Map<string, string>();
    if (form?.form_id) {
      const { data: fields } = await admin.from("form_fields")
        .select("id, label, field_type, sort").eq("form_id", form.form_id).order("sort");
      (fields ?? []).forEach((f: any) => fieldMap.set(f.id, f.label));
      formFields = (fields ?? []).map((f: any) => ({ id: f.id, label: f.label, type: f.field_type }));
    }

    rows = await Promise.all((apps ?? []).map(async (a) => {
      const { data: prof } = await admin.from("profiles").select("full_name, email").eq("id", a.talent_id).maybeSingle();
      const answers = Object.entries((a.answers as Record<string, any>) ?? {})
        .filter(([k]) => fieldMap.has(k))
        .map(([k, v]) => ({ field_id: k, label: fieldMap.get(k)!, value: Array.isArray(v) ? v.join(", ") : String(v) }));
      const card = a.talent_id ? await buildCandidateCard(a.talent_id, false) : null;
      return {
        id: a.id, talent_id: a.talent_id, status: a.status, rules_passed: a.rules_passed,
        ai_fit_score: a.ai_fit_score, ai_summary: a.ai_summary, created_at: a.created_at,
        name: prof?.full_name ?? a.guest_name ?? "—", guest: !a.talent_id,
        email: "🔒 Unlock to view", contact_locked: true, card,
        answers, resumeUrl: (a.guest_resume_path || a.resume_document_id) ? `/api/employer/resume?application_id=${a.id}` : null
      };
    }));
  }

  return (
    <>
      <PageHeader title="Shortlists"
        sub="Work a role's applicants — rank by fit, move them through the pipeline, and build the shortlist that closes." />

      {(jobs ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No open roles to shortlist for.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            {(jobs ?? []).map((j) => (
              <Link key={j.id} href={`/portal/recruiter/shortlists?job=${j.id}`}
                className={`px-3 h-9 inline-flex items-center rounded-pill text-xs font-semibold border transition ${
                  j.id === jobId ? "bg-ink text-white border-ink" : "border-line hover:border-coral"}`}>
                {j.title}
              </Link>
            ))}
          </div>

          {job && <p className="text-sm text-muted-2 mb-3">{rows.length} applicant{rows.length === 1 ? "" : "s"} for <b className="text-ink">{job.title}</b></p>}
          {rows.length > 0 && <ApplicantCharts rows={rows as any} formFields={formFields} />}
          <ApplicantTable rows={rows as any} statusEndpoint="/api/employer/application-status" jobId={jobId ?? undefined} />
        </>
      )}
    </>
  );
}
