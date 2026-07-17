import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { JobEditor } from "@/components/JobEditor";
import { FormBuilder } from "@/components/FormBuilder";
import { getMyOrg } from "@/lib/org";

export default async function EmployerEditJob({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const org = await getMyOrg(supabase, user!.id);
  const { data: job } = await supabase.from("jobs").select("*").eq("id", params.id).single();
  if (!job || !org || job.org_id !== org.id) redirect("/portal/employer/jobs");

  const [{ data: niches }, { data: fields }] = await Promise.all([
    supabase.from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort"),
    job.form_id
      ? supabase.from("form_fields").select("*").eq("form_id", job.form_id).order("sort")
      : Promise.resolve({ data: [] as any[] })
  ]);

  return (
    <>
      <PageHeader title={job.title}
        sub="Edit the role and shape its application form. Rules on fields auto-shortlist eligible applicants."
        action={<Link href={`/portal/employer/jobs/${params.id}/applicants`} className="btn-ghost">View applicants →</Link>} />
      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <JobEditor job={job} niches={niches ?? []} orgId={org.id} basePath="/portal/employer/jobs" />
        <FormBuilder jobId={params.id} formId={job.form_id ?? null} initial={(fields ?? []) as any} />
      </div>
    </>
  );
}
