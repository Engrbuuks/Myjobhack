import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ApplicantTable } from "@/components/ApplicantTable";
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
  if (job.form_id) {
    const { data: fields } = await admin.from("form_fields").select("id, label").eq("form_id", job.form_id);
    (fields ?? []).forEach((f) => fieldMap.set(f.id, f.label));
  }

  const rows = await Promise.all(
    (apps ?? []).map(async (a) => {
      const { data: prof } = await admin.from("profiles").select("full_name, email").eq("id", a.talent_id).single();
      let resumeUrl: string | null = null;
      if (a.guest_resume_path) {
        const { data: gs } = await admin.storage.from("documents").createSignedUrl(a.guest_resume_path, 3600);
        resumeUrl = gs?.signedUrl ?? null;
      } else if (a.resume_document_id) {
        const { data: doc } = await admin.from("documents").select("bucket, path").eq("id", a.resume_document_id).single();
        if (doc) {
          const { data: s } = await admin.storage.from(doc.bucket).createSignedUrl(doc.path, 3600);
          resumeUrl = s?.signedUrl ?? null;
        }
      }
      const answers = Object.entries((a.answers as Record<string, any>) ?? {})
        .filter(([k]) => fieldMap.has(k))
        .map(([k, v]) => ({ label: fieldMap.get(k)!, value: Array.isArray(v) ? v.join(", ") : String(v) }));
      return {
        id: a.id, status: a.status, rules_passed: a.rules_passed,
        ai_fit_score: a.ai_fit_score, ai_summary: a.ai_summary,
        created_at: a.created_at, name: prof?.full_name ?? a.guest_name ?? "—", guest: !a.talent_id,
        email: prof?.email ?? a.guest_email ?? "", answers, resumeUrl
      };
    })
  );

  return (
    <>
      <PageHeader title={`Applicants — ${job.title}`}
        sub={`${rows.length} total · sorted by AI fit score`}
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
      <ApplicantTable rows={rows} statusEndpoint="/api/employer/application-status" />
    </>
  );
}
