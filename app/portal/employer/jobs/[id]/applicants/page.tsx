import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ApplicantTable } from "@/components/ApplicantTable";
import { ApplicantCharts } from "@/components/ApplicantCharts";
import { buildCandidateCard } from "@/lib/candidateCard";
import { getMyOrg } from "@/lib/org";

export default async function EmployerApplicants({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const org = await getMyOrg(supabase, user!.id);
  const { data: job } = await supabase.from("jobs").select("id, title, org_id, form_id, openings, hired_count").eq("id", params.id).single();
  if (!job || !org || job.org_id !== org.id) redirect("/portal/employer/jobs");

  // membership verified above — service client assembles the full applicant view
  const admin = createAdminClient();
  const { data: apps } = await admin.from("applications").select("*").eq("job_id", params.id)
    .order("ai_fit_score", { ascending: false, nullsFirst: false });

  const fieldMap = new Map<string, string>();
  // Carry the field TYPE through as well — only fixed-choice and numeric fields
  // are worth counting. Free text produces one unique answer per person.
  let formFields: { id: string; label: string; type: string }[] = [];
  if (job.form_id) {
    const { data: fields } = await admin.from("form_fields")
      .select("id, label, field_type, sort").eq("form_id", job.form_id).order("sort");
    (fields ?? []).forEach((f: any) => fieldMap.set(f.id, f.label));
    formFields = (fields ?? []).map((f: any) => ({ id: f.id, label: f.label, type: f.field_type }));
  }

  // Which candidates has this employer unlocked or placed? (email is masked otherwise)
  const empId = user!.id;
  const { data: unlocks } = await admin.from("profile_unlocks").select("talent_id").eq("employer_id", empId);
  const { data: placed } = await admin.from("placements").select("talent_id").eq("employer_id", empId);
  const released = new Set([...(unlocks ?? []).map((u: any) => u.talent_id), ...(placed ?? []).map((p: any) => p.talent_id)]);

  const rows = await Promise.all(
    (apps ?? []).map(async (a) => {
      const { data: prof } = await admin.from("profiles").select("full_name, email").eq("id", a.talent_id).single();
      const isReleased = a.talent_id ? released.has(a.talent_id) : false;
      // Résumés go through the redaction endpoint — contact details are
      // scrubbed until the employer unlocks the candidate or records a placement.
      const hasResume = !!(a.guest_resume_path || a.resume_document_id);
      const resumeUrl = hasResume ? `/api/employer/resume?application_id=${a.id}` : null;
      const answers = Object.entries((a.answers as Record<string, any>) ?? {})
        .filter(([k]) => fieldMap.has(k))
        .map(([k, v]) => ({ field_id: k, label: fieldMap.get(k)!, value: Array.isArray(v) ? v.join(", ") : String(v), raw: v }));
      // Structured card — the leak-proof evaluation surface (résumé stays gated).
      const card = a.talent_id ? await buildCandidateCard(a.talent_id, isReleased) : null;
      return {
        id: a.id, talent_id: a.talent_id, status: a.status, rules_passed: a.rules_passed,
        ai_fit_score: a.ai_fit_score, ai_summary: a.ai_summary,
        created_at: a.created_at, name: prof?.full_name ?? a.guest_name ?? "—", guest: !a.talent_id,
        email: isReleased ? (prof?.email ?? a.guest_email ?? "") : "🔒 Unlock to view",
        contact_locked: !isReleased, card,
        answers, resumeUrl
      };
    })
  );

  return (
    <>
      <PageHeader title={`Applicants — ${job.title}`}
        sub={`${rows.length} applicant${rows.length === 1 ? "" : "s"} · sort, filter and search below`}
        action={<Link href={`/portal/employer/jobs/${params.id}`} className="btn-ghost">← Edit job</Link>} />

      {(job.openings ?? 1) > 1 && (
        <div className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">Hiring progress</span>
            <span className="text-sm text-muted-2">{job.hired_count ?? 0} of {job.openings} hired</span>
          </div>
          <div className="h-3 rounded-full bg-paper-2 overflow-hidden">
            <div className="h-full bg-coral rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.round(((job.hired_count ?? 0) / job.openings) * 100))}%` }} />
          </div>
          <p className="text-xs text-muted-2 mt-2">
            Mark applicants "hired" as you fill the {job.openings} openings — the posting auto-closes when full. Use the bulk actions below to move many at once.
          </p>
        </div>
      )}
      <ApplicantTable rows={rows} statusEndpoint="/api/employer/application-status" jobId={params.id} />
    </>
  );
}
