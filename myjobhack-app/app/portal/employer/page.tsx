import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DashHero } from "@/components/DashHero";
import { StatCard } from "@/components/StatCard";
import { weeklyCounts } from "@/components/Spark";
import { getMyOrg } from "@/lib/org";

export default async function EmployerDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const org = await getMyOrg(supabase, user!.id);

  if (!org) {
    return (
      <>
        <DashHero kicker="Your hiring desk" title="First, your company."
          sub="Set up your organization once — then every role you post carries it, and your applicant desk goes live.">
          <Link href="/portal/employer/company" className="btn-coral !h-11">Set up company →</Link>
        </DashHero>
      </>
    );
  }

  const { data: jobs } = await supabase.from("jobs").select("id, title, status").eq("org_id", org.id);
  const jobIds = (jobs ?? []).map((j) => j.id);
  const { data: apps } = jobIds.length
    ? await supabase.from("applications").select("job_id, status, ai_fit_score, created_at").in("job_id", jobIds)
    : { data: [] as any[] };

  const open = (jobs ?? []).filter((j) => j.status === "published").length;
  const shortlisted = (apps ?? []).filter((a) => ["shortlisted", "interviewing", "offered"].includes(a.status)).length;
  const scores = (apps ?? []).map((a) => a.ai_fit_score).filter((s): s is number => s != null);
  const avgFit = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const appSpark = weeklyCounts((apps ?? []).map((a) => a.created_at));
  const thisWeek = appSpark[appSpark.length - 1];
  const jmap = new Map((jobs ?? []).map((j) => [j.id, j.title]));
  const recent = [...(apps ?? [])]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5);

  return (
    <>
      <DashHero kicker="Your hiring desk" title={org.name}
        sub={thisWeek > 0
          ? `${thisWeek} application${thisWeek === 1 ? "" : "s"} arrived this week — pre-screened, scored, and sorted before you opened this page.`
          : "Roles, custom forms, and candidates that sort themselves."}
        right={avgFit != null ? (
          <div className="text-right">
            <div className="numeral !text-6xl text-coral leading-none">{avgFit}</div>
            <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-white/45 mt-2">Avg AI fit</div>
          </div>
        ) : undefined}>
        <div className="flex flex-wrap gap-3">
          <Link href="/portal/employer/jobs/new" className="btn-coral !h-11">＋ Post a job</Link>
          <Link href="/portal/employer/applicants" className="inline-flex items-center px-5 h-11 rounded-pill border border-white/20 text-sm font-bold text-white hover:border-coral hover:text-coral transition">
            Review applicants →
          </Link>
        </div>
      </DashHero>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard label="Open roles" value={open} accent hint={`${(jobs ?? []).length} total posted`} />
        <StatCard label="Applicants" value={(apps ?? []).length} spark={appSpark} hint="Last 8 weeks" />
        <StatCard label="Shortlisted+" value={shortlisted} hint="Passed rules or advanced by you" />
        <StatCard label="Avg AI fit" value={avgFit ?? "—"} hint="CV-vs-JD scanning" />
      </div>

      {recent.length > 0 && (
        <div className="card p-6">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-5">Latest applications</div>
          <div className="space-y-2">
            {recent.map((a, i) => (
              <Link key={i} href={`/portal/employer/jobs/${a.job_id}/applicants`}
                className="flex items-center gap-4 rounded-xl border border-line px-4 py-3 hover:border-coral transition">
                <span className="flex-1 text-sm font-medium truncate">{jmap.get(a.job_id) ?? "Role"}</span>
                <span className="px-2.5 py-1 rounded-pill bg-paper-2 text-muted text-xs font-bold capitalize">{a.status.replace(/_/g, " ")}</span>
                {a.ai_fit_score != null && (
                  <span className="font-display font-semibold text-lg w-10 text-right">{Math.round(a.ai_fit_score)}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
