import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DashHero } from "@/components/DashHero";
import { StatCard } from "@/components/StatCard";
import { Spark, weeklyCounts, timeAgo } from "@/components/Spark";

async function count(supabase: any, table: string, filter?: (q: any) => any) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

export default async function AdminDashboard() {
  const supabase = createClient();
  const since = new Date(Date.now() - 8 * 7 * 864e5).toISOString();

  const [talent, verified, pendingCreds, pendingElite, pendingPayments, jobs, trainings,
    { data: signupDates }, { data: appDates }] = await Promise.all([
    count(supabase, "talent_profiles"),
    count(supabase, "talent_profiles", (q) => q.eq("verification", "verified")),
    count(supabase, "credentials", (q) => q.in("status", ["pending", "in_review"])),
    count(supabase, "elite_memberships", (q) => q.in("status", ["pending", "in_review"])),
    count(supabase, "payments", (q) => q.eq("status", "pending_review")),
    count(supabase, "jobs", (q) => q.eq("status", "published")),
    count(supabase, "trainings", (q) => q.in("status", ["open", "in_progress"])),
    supabase.from("talent_profiles").select("created_at").gte("created_at", since),
    supabase.from("applications").select("created_at").gte("created_at", since)
  ]);

  const signupSpark = weeklyCounts((signupDates ?? []).map((d) => d.created_at));
  const appSpark = weeklyCounts((appDates ?? []).map((d) => d.created_at));
  const newThisWeek = signupSpark[signupSpark.length - 1];

  const { data: niches } = await supabase
    .from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort");
  const nicheCounts = await Promise.all(
    (niches ?? []).map(async (n) => ({
      label: n.label,
      count: await count(supabase, "talent_profiles", (q) => q.eq("niche_id", n.id))
    }))
  );
  const topNiche = Math.max(1, ...nicheCounts.map((n) => n.count));

  const { data: activity } = await supabase
    .from("activity_log").select("action, entity, created_at")
    .order("created_at", { ascending: false }).limit(8);

  const queues = [
    { label: "Credential verifications", count: pendingCreds, href: "/portal/admin/verifications" },
    { label: "Elite membership reviews", count: pendingElite, href: "/portal/admin/verifications" },
    { label: "Payments awaiting confirmation", count: pendingPayments, href: "/portal/admin/payments" }
  ];
  const openQueues = queues.filter((q) => q.count > 0);
  const queueTotal = openQueues.reduce((a, q) => a + q.count, 0);

  return (
    <>
      <DashHero kicker="Mission control" title="The machine, at a glance."
        sub={queueTotal > 0
          ? `${queueTotal} item${queueTotal === 1 ? "" : "s"} waiting on a human decision — everything else is running itself.`
          : "Every queue is clear. The machine is running itself."}
        right={
          <div className="text-right">
            <div className="numeral !text-6xl text-coral leading-none">{talent}</div>
            <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-white/45 mt-2">Talent in pool</div>
            <div className="mt-3 flex justify-end"><Spark data={signupSpark} accent w={120} h={34} /></div>
            <div className="text-[10px] text-white/40 mt-1.5">{newThisWeek} joined this week</div>
          </div>
        }>
        <div className="flex flex-wrap gap-3">
          <Link href="/portal/admin/invites" className="btn-coral !h-11">Send invites ✉</Link>
          <Link href="/portal/admin/pool" className="inline-flex items-center px-5 h-11 rounded-pill border border-white/20 text-sm font-bold text-white hover:border-coral hover:text-coral transition">
            Open the pool →
          </Link>
        </div>
      </DashHero>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard label="Verified profiles" value={verified} hint="Credentials confirmed by the team" accent />
        <StatCard label="Applications" value={(appDates ?? []).length} spark={appSpark} hint="Last 8 weeks" />
        <StatCard label="Published jobs" value={jobs} hint="Live on the platform" />
        <StatCard label="Active trainings" value={trainings} hint="External + LMS" />
      </div>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-5 mb-5">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">Needs a human</div>
            {queueTotal > 0 && (
              <span className="inline-grid place-items-center min-w-6 h-6 px-2 rounded-pill bg-coral text-white text-xs font-bold">
                {queueTotal}
              </span>
            )}
          </div>
          {openQueues.length === 0 ? (
            <div className="flex items-center gap-3 text-sm text-muted">
              <span className="w-8 h-8 rounded-full bg-ink text-white grid place-items-center">✓</span>
              All queues clear — nothing is waiting on you.
            </div>
          ) : (
            <div className="space-y-3">
              {openQueues.map((q) => (
                <Link key={q.label} href={q.href}
                  className="flex items-center justify-between rounded-xl border border-line px-4 py-3.5 hover:border-coral hover:bg-paper transition group">
                  <span className="text-sm font-semibold">{q.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="inline-grid place-items-center min-w-7 h-7 px-2 rounded-pill bg-coral text-white text-xs font-bold">
                      {q.count}
                    </span>
                    <span className="text-coral text-sm font-semibold opacity-0 group-hover:opacity-100 transition">Review →</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-5">The pulse</div>
          {(activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-2">Registrations, applications, and payments stream here in real time.</p>
          ) : (
            <div className="relative pl-5">
              <span className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-line" />
              <div className="space-y-4">
                {(activity ?? []).map((a, i) => (
                  <div key={i} className="relative flex items-baseline gap-3 text-sm">
                    <span className={`absolute -left-5 top-1.5 w-2 h-2 rounded-full ${i === 0 ? "bg-coral" : "bg-line"}`} />
                    <span className="flex-1 leading-snug">{a.action}
                      <span className="text-muted-2"> · {a.entity}</span></span>
                    <span className="text-muted-2 text-xs whitespace-nowrap">{timeAgo(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">Pool by niche</div>
          <Link href="/portal/admin/pool" className="text-coral text-sm font-semibold">Slice it →</Link>
        </div>
        {talent === 0 ? (
          <p className="text-sm text-muted-2">Counts appear as talent joins the pool.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-x-10 gap-y-4">
            {nicheCounts.filter((n) => n.count > 0).map((n) => (
              <div key={n.label}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm font-medium">{n.label}</span>
                  <span className="font-display font-semibold">{n.count}</span>
                </div>
                <div className="h-2 rounded-pill bg-paper-2 overflow-hidden">
                  <div className="h-full rounded-pill bg-coral" style={{ width: `${(n.count / topNiche) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
