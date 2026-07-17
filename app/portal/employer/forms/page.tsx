import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";

export default async function EmployerForms() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: forms } = await supabase.from("application_forms")
    .select("id, name, created_at").eq("created_by", user!.id).order("created_at", { ascending: false });
  const formIds = (forms ?? []).map((f) => f.id);
  const counts = new Map<string, number>();
  const jobByForm = new Map<string, { id: string; title: string }>();
  if (formIds.length) {
    const [{ data: fields }, { data: jobs }] = await Promise.all([
      supabase.from("form_fields").select("form_id").in("form_id", formIds),
      supabase.from("jobs").select("id, title, form_id").in("form_id", formIds)
    ]);
    (fields ?? []).forEach((f) => counts.set(f.form_id, (counts.get(f.form_id) ?? 0) + 1));
    (jobs ?? []).forEach((j) => j.form_id && jobByForm.set(j.form_id, { id: j.id, title: j.title }));
  }

  return (
    <>
      <PageHeader title="Application forms"
        sub="Forms are built per job — open a role and shape its form there. Rules on any field auto-shortlist." />
      {(forms ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          No forms yet. <Link href="/portal/employer/jobs" className="text-coral font-semibold">Open a job</Link> and add one.
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {(forms ?? []).map((f) => {
            const job = jobByForm.get(f.id);
            return (
              <div key={f.id} className="card p-5 flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{job?.title ?? f.name}</div>
                  <div className="text-xs text-muted-2">{counts.get(f.id) ?? 0} fields · {new Date(f.created_at).toLocaleDateString()}</div>
                </div>
                {job && (
                  <Link href={`/portal/employer/jobs/${job.id}`} className="text-coral font-semibold text-sm">Edit form →</Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
