import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { getMyOrg } from "@/lib/org";

export default async function EmployerDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const org = await getMyOrg(supabase, user!.id);

  if (!org) {
    return (
      <>
        <PageHeader title="Your hiring desk" sub="Post roles, build custom application forms, and watch qualified candidates sort themselves." />
        <div className="card p-8 max-w-lg bg-ink text-white border-ink">
          <div className="font-display font-semibold text-2xl mb-2">First, your company.</div>
          <p className="text-white/60 text-sm mb-5">Set up your organization once — then every role you post carries it.</p>
          <Link href="/portal/employer/company" className="btn-coral">Set up company →</Link>
        </div>
      </>
    );
  }

  const { data: jobs } = await supabase.from("jobs").select("id, status").eq("org_id", org.id);
  const jobIds = (jobs ?? []).map((j) => j.id);
  const { data: apps } = jobIds.length
    ? await supabase.from("applications").select("status, ai_fit_score").in("job_id", jobIds)
    : { data: [] as any[] };

  const open = (jobs ?? []).filter((j) => j.status === "published").length;
  const shortlisted = (apps ?? []).filter((a) => ["shortlisted", "interviewing", "offered"].includes(a.status)).length;
  const scores = (apps ?? []).map((a) => a.ai_fit_score).filter((s): s is number => s != null);
  const avgFit = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return (
    <>
      <PageHeader title={org.name}
        sub="Your hiring desk — roles, custom forms, and candidates that sort themselves."
        action={<Link href="/portal/employer/jobs/new" className="btn-coral">＋ Post a job</Link>} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard label="Open roles" value={open} accent hint={`${(jobs ?? []).length} total posted`} />
        <StatCard label="Applicants" value={(apps ?? []).length} hint="Across all roles" />
        <StatCard label="Shortlisted+" value={shortlisted} hint="Passed rules or advanced by you" />
        <StatCard label="Avg AI fit" value={avgFit ?? "—"} hint="CV-vs-JD scanning" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/portal/employer/jobs" className="btn-ghost">Manage jobs</Link>
        <Link href="/portal/employer/applicants" className="btn-ghost">Review applicants</Link>
        <Link href="/portal/employer/company" className="btn-ghost">Company settings</Link>
      </div>
    </>
  );
}
