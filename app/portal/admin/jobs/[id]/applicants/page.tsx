import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ApplicantTable } from "@/components/ApplicantTable";
import { ApplicantCharts } from "@/components/ApplicantCharts";
import { buildCandidateCard } from "@/lib/candidateCard";

export const dynamic = "force-dynamic";

export default async function Applicants({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const admin = createAdminClient();

  const [{ data: job }, { data: apps }] = await Promise.all([
    supabase.from("jobs").select("id, title, form_id, openings, hired_count").eq("id", params.id).single(),
    supabase.from("applications").select("*").eq("job_id", params.id)
      .order("ai_fit_score", { ascending: false, nullsFirst: false })
  ]);

  // Carry the field TYPE through so the charts know what is worth counting.
  const fieldMap = new Map<string, string>();
  let formFields: { id: string; label: string; type: string }[] = [];
  if (job?.form_id) {
    const { data: fields } = await admin.from("form_fields")
      .select("id, label, field_type, sort").eq("form_id", job.form_id).order("sort");
    (fields ?? []).forEach((f: any) => fieldMap.set(f.id, f.label));
    formFields = (fields ?? []).map((f: any) => ({ id: f.id, label: f.label, type: f.field_type }));
  }

  const rows = await Promise.all(
    (apps ?? []).map(async (a) => {
      const { data: prof } = a.talent_id
        ? await admin.from("profiles").select("full_name, email").eq("id", a.talent_id).maybeSingle()
        : { data: null as any };

      const answers = Object.entries((a.answers as Record<string, any>) ?? {})
        .filter(([k]) => fieldMap.has(k))
        .map(([k, v]) => ({
          field_id: k, label: fieldMap.get(k)!,
          value: Array.isArray(v) ? v.join(", ") : String(v)
        }));

      // Admins see the full card — but résumés still go through the redaction
      // endpoint rather than a raw signed URL, so the same rules apply everywhere.
      const card = a.talent_id ? await buildCandidateCard(a.talent_id, true) : null;
      const hasResume = !!(a.guest_resume_path || a.resume_document_id);

      return {
        id: a.id, talent_id: a.talent_id, status: a.status, rules_passed: a.rules_passed,
        ai_fit_score: a.ai_fit_score, ai_summary: a.ai_summary,
        created_at: a.created_at,
        name: prof?.full_name ?? a.guest_name ?? "—", guest: !a.talent_id,
        email: prof?.email ?? a.guest_email ?? "",
        contact_locked: false, card,
        answers,
        resumeUrl: hasResume ? `/api/employer/resume?application_id=${a.id}` : null
      };
    })
  );

  const shortlisted = rows.filter((r) => r.status === "shortlisted").length;

  return (
    <>
      <PageHeader title={`Applicants — ${job?.title ?? ""}`}
        sub={`${rows.length} applicant${rows.length === 1 ? "" : "s"} · ${shortlisted} shortlisted · sort, filter and search below`}
        action={<Link href={`/portal/admin/jobs/${params.id}`} className="btn-ghost">← Edit job</Link>} />
      <ApplicantCharts rows={rows as any} openings={job?.openings ?? 1} formFields={formFields} />
      <ApplicantTable rows={rows as any} statusEndpoint="/api/employer/application-status" jobId={params.id} />
    </>
  );
}
