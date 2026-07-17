import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { DynamicApplicationForm } from "@/components/DynamicApplicationForm";

export default async function JobDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: job } = await supabase.from("jobs").select("*").eq("id", params.id).single();
  if (!job || job.status !== "published") {
    return <PageHeader title="Role unavailable" sub="This role is no longer open." />;
  }
  const [{ data: fields }, { data: talent }, { data: existing }] = await Promise.all([
    job.form_id
      ? supabase.from("form_fields").select("id, label, field_type, options, required").eq("form_id", job.form_id).order("sort")
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("talent_profiles").select("resume_document_id").eq("profile_id", user!.id).single(),
    supabase.from("applications").select("id, status").eq("job_id", params.id).eq("talent_id", user!.id).maybeSingle()
  ]);

  return (
    <>
      <PageHeader title={job.title}
        sub={[job.location, job.work_mode, job.employment_type?.replace(/_/g, " "), job.salary_note].filter(Boolean).join(" · ")} />
      <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">About the role</div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{job.description || "Details shared during the process."}</p>
        </div>
        {existing ? (
          <div className="card p-6 text-sm">
            <b>You&rsquo;ve applied.</b> Status:{" "}
            <span className="capitalize font-semibold text-coral">{existing.status.replace(/_/g, " ")}</span>
            <p className="text-muted mt-2">Track it under Applications.</p>
          </div>
        ) : (
          <DynamicApplicationForm jobId={params.id} fields={(fields ?? []) as any}
            hasResume={!!talent?.resume_document_id} />
        )}
      </div>
    </>
  );
}
