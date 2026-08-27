import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { getMyOrg } from "@/lib/org";

export default async function AllApplicants() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const org = await getMyOrg(supabase, user!.id);
  if (!org) {
    return (
      <>
        <PageHeader title="Applicants" />
        <div className="card p-8 text-sm">Set up your <Link href="/portal/employer/company" className="text-coral font-semibold">company</Link> first.</div>
      </>
    );
  }
  const { data: jobs } = await supabase.from("jobs").select("id, title, status").eq("org_id", org.id)
    .order("created_at", { ascending: false });
  const jobIds = (jobs ?? []).map((j) => j.id);
  const stats = new Map<string, { total: number; short: number }>();
  if (jobIds.length) {
    const { data: apps } = await supabase.from("applications").select("job_id, status").in("job_id", jobIds);
    (apps ?? []).forEach((a) => {
      const s = stats.get(a.job_id) ?? { total: 0, short: 0 };
      s.total++;
      if (["shortlisted", "interviewing", "offered", "hired"].includes(a.status)) s.short++;
      stats.set(a.job_id, s);
    });
  }

  return (
    <>
      <PageHeader title="Applicants" sub="Pick a role to review its candidates — sorted by AI fit, rules pre-checked." />
      {(jobs ?? []).length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">Post a role first — applicants gather here.</div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {(jobs ?? []).map((j) => {
            const s = stats.get(j.id) ?? { total: 0, short: 0 };
            return (
              <Link key={j.id} href={`/portal/employer/jobs/${j.id}/applicants`}
                className="card p-5 flex items-center gap-4 hover:border-coral transition">
                <div className="flex-1">
                  <div className="font-semibold text-sm">{j.title}</div>
                  <div className="text-xs text-muted-2 capitalize">{j.status}</div>
                </div>
                <div className="text-center">
                  <div className="font-display font-semibold text-xl">{s.total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Total</div>
                </div>
                <div className="text-center">
                  <div className="font-display font-semibold text-xl text-coral">{s.short}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Advanced</div>
                </div>
                <span className="text-coral font-semibold text-sm">Review →</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
