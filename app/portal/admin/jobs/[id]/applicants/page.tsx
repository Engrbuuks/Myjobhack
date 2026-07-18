import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { ApplicantTable } from "@/components/ApplicantTable";

export default async function Applicants({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: job }, { data: apps }] = await Promise.all([
    supabase.from("jobs").select("id, title, form_id").eq("id", params.id).single(),
    supabase.from("applications").select("*").eq("job_id", params.id)
      .order("ai_fit_score", { ascending: false, nullsFirst: false })
  ]);

  const fieldMap = new Map<string, string>();
  if (job?.form_id) {
    const { data: fields } = await supabase
      .from("form_fields").select("id, label").eq("form_id", job.form_id);
    (fields ?? []).forEach((f) => fieldMap.set(f.id, f.label));
  }

  const rows = await Promise.all(
    (apps ?? []).map(async (a) => {
      const { data: prof } = a.talent_id
        ? await supabase.from("profiles").select("full_name, email").eq("id", a.talent_id).maybeSingle()
        : { data: null as any };
      let resumeUrl: string | null = null;
      if (a.guest_resume_path) {
        const { data: gs } = await supabase.storage.from("documents").createSignedUrl(a.guest_resume_path, 3600);
        resumeUrl = gs?.signedUrl ?? null;
      } else if (a.resume_document_id) {
        const { data: doc } = await supabase
          .from("documents").select("bucket, path").eq("id", a.resume_document_id).single();
        if (doc) {
          const { data: s } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.path, 3600);
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

  const shortlisted = rows.filter((r) => r.status === "shortlisted").length;

  return (
    <>
      <PageHeader title={`Applicants — ${job?.title ?? ""}`}
        sub={`${rows.length} total · ${shortlisted} shortlisted · sorted by AI fit score`}
        action={<Link href={`/portal/admin/jobs/${params.id}`} className="btn-ghost">← Edit job</Link>} />
      <ApplicantTable rows={rows} />
    </>
  );
}
