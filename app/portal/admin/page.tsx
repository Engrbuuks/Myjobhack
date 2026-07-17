import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";

async function count(supabase: any, table: string, filter?: (q: any) => any) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

export default async function AdminDashboard() {
  const supabase = createClient();

  const [talent, verified, pendingCreds, pendingElite, pendingPayments, jobs, trainings] =
    await Promise.all([
      count(supabase, "talent_profiles"),
      count(supabase, "talent_profiles", (q) => q.eq("verification", "verified")),
      count(supabase, "credentials", (q) => q.in("status", ["pending", "in_review"])),
      count(supabase, "elite_memberships", (q) => q.in("status", ["pending", "in_review"])),
      count(supabase, "payments", (q) => q.eq("status", "pending_review")),
      count(supabase, "jobs", (q) => q.eq("status", "published")),
      count(supabase, "trainings", (q) => q.in("status", ["open", "in_progress"]))
    ]);

  // pool composition by axis
  const { data: niches } = await supabase
    .from("taxonomies").select("id, label").eq("kind", "niche").eq("active", true).order("sort");
  const nicheCounts = await Promise.all(
    (niches ?? []).map(async (n) => ({
      label: n.label,
      count: await count(supabase, "talent_profiles", (q) => q.eq("niche_id", n.id))
    }))
  );

  const { data: activity } = await supabase
    .from("activity_log")
    .select("action, entity, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  const queues = [
    { label: "Credential verifications", count: pendingCreds, href: "/portal/admin/verifications" },
    { label: "Elite membership reviews", count: pendingElite, href: "/portal/admin/verifications" },
    { label: "Payments awaiting confirmation", count: pendingPayments, href: "/portal/admin/payments" }
  ].filter((q) => q.count > 0);

  return (
    <>
      <PageHeader
        title="Mission control"
        sub="The pool at a glance — every axis counted, every queue visible, one button from a full training room."
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard label="Talent in pool" value={talent} hint="Free members, all niches" accent />
        <StatCard label="Verified profiles" value={verified} hint="Credentials confirmed" />
        <StatCard label="Published jobs" value={jobs} hint="Live on the platform" />
        <StatCard label="Active trainings" value={trainings} hint="External + LMS" />
      </div>

      {/* Pending queues — the sample-4 pattern */}
      <div className="card p-6 mb-8">
        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Pending actions</div>
        {queues.length === 0 ? (
          <p className="text-sm text-muted-2">All queues are clear. ✓</p>
        ) : (
          <div className="space-y-3">
            {queues.map((q) => (
              <a key={q.label} href={q.href}
                className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:border-coral transition group">
                <span className="text-sm font-medium">{q.label}</span>
                <span className="flex items-center gap-3">
                  <span className="inline-grid place-items-center min-w-7 h-7 px-2 rounded-pill bg-coral text-white text-xs font-bold">
                    {q.count}
                  </span>
                  <span className="text-coral text-sm font-semibold opacity-0 group-hover:opacity-100 transition">
                    Review →
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Pool composition */}
        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Pool by niche</div>
          {talent === 0 ? (
            <p className="text-sm text-muted-2">Counts appear as talent joins the pool.</p>
          ) : (
            <div className="space-y-3">
              {nicheCounts.filter((n) => n.count > 0).map((n) => (
                <div key={n.label} className="flex items-center gap-3">
                  <span className="text-sm flex-1">{n.label}</span>
                  <span className="font-display font-semibold text-lg">{n.count}</span>
                  <span className="h-1.5 rounded-pill bg-coral"
                    style={{ width: `${Math.max(8, (n.count / Math.max(talent, 1)) * 120)}px` }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Latest activity</div>
          {(activity ?? []).length === 0 ? (
            <p className="text-sm text-muted-2">Registrations, applications, and payments stream here in real time.</p>
          ) : (
            <div className="space-y-3">
              {(activity ?? []).map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-coral shrink-0" />
                  <span className="flex-1">{a.action} · {a.entity}</span>
                  <span className="text-muted-2 text-xs">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
