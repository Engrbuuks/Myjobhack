import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { getMyOrg } from "@/lib/org";

export default async function EmployerJobs() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const org = await getMyOrg(supabase, user!.id);
  if (!org) {
    return (
      <>
        <PageHeader title="My jobs" />
        <div className="card p-8 text-sm">Set up your <Link href="/portal/employer/company" className="text-coral font-semibold">company</Link> first.</div>
      </>
    );
  }
  const { data: jobs } = await supabase.from("jobs")
    .select("id, title, location, status, employment_type, form_id")
    .eq("org_id", org.id).order("created_at", { ascending: false });
  const jobIds = (jobs ?? []).map((j) => j.id);
  const counts = new Map<string, number>();
  if (jobIds.length) {
    const { data: apps } = await supabase.from("applications").select("job_id").in("job_id", jobIds);
    (apps ?? []).forEach((a) => counts.set(a.job_id, (counts.get(a.job_id) ?? 0) + 1));
  }

  return (
    <>
      <PageHeader title="My jobs" sub={`Roles posted by ${org.name}.`}
        action={<Link href="/portal/employer/jobs/new" className="btn-coral">＋ Post a job</Link>} />
      {(jobs ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No roles yet — post the first one.</div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {(jobs ?? []).map((j) => (
            <div key={j.id} className="card p-5 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-52">
                <div className="font-semibold text-sm">{j.title}</div>
                <div className="text-xs text-muted-2">{j.location || "—"} · {j.employment_type.replace(/_/g, " ")} · {j.form_id ? "custom form ✓" : "default form"}</div>
              </div>
              <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${
                j.status === "published" ? "bg-ink text-white" : j.status === "draft" ? "bg-coral-soft text-coral" : "bg-paper-2 text-muted"}`}>
                {j.status}
              </span>
              <div className="font-display font-semibold text-lg">{counts.get(j.id) ?? 0}</div>
              <Link href={`/portal/employer/jobs/${j.id}/applicants`} className="text-ink font-semibold text-sm">Applicants</Link>
              <Link href={`/portal/employer/jobs/${j.id}`} className="text-coral font-semibold text-sm">Edit →</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
