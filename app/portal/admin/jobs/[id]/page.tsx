import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { JobEditor } from "@/components/JobEditor";
import { FormBuilder } from "@/components/FormBuilder";

export default async function EditJob({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: job }, { data: niches }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).single(),
    supabase.from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort")
  ]);
  const { data: fields } = job?.form_id
    ? await supabase.from("form_fields").select("*").eq("form_id", job.form_id).order("sort")
    : { data: [] };

  return (
    <>
      <PageHeader title={job?.title ?? "Job"} sub="Edit the role and shape its application form. Rules on fields auto-shortlist eligible applicants."
        action={<Link href={`/portal/admin/jobs/${params.id}/applicants`} className="btn-ghost">View applicants →</Link>} />
      <div className="grid xl:grid-cols-2 gap-6 items-start">
        <JobEditor job={job} niches={niches ?? []} />
        <FormBuilder jobId={params.id} formId={job?.form_id ?? null} initial={(fields ?? []) as any} />
      </div>
    </>
  );
}
