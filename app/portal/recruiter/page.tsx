import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";

export default async function RecruiterDashboard() {
  const supabase = createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();
  const first = (profile?.full_name || "there").split(" ")[0];

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [{ count: poolCount }, { count: openJobs }, { count: pendingCreds }, { count: placementsThisMonth }, { data: recentJobs }] =
    await Promise.all([
      admin.from("talent_profiles").select("profile_id", { count: "exact", head: true }),
      admin.from("jobs").select("id", { count: "exact", head: true }).eq("status", "published"),
      admin.from("credentials").select("id", { count: "exact", head: true }).in("status", ["pending", "in_review"]),
      admin.from("placements").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
      admin.from("jobs").select("id, title, company_name, openings, hired_count")
        .eq("status", "published").order("created_at", { ascending: false }).limit(5)
    ]);

  return (
    <>
      <PageHeader title="The talent floor"
        sub="Slice the pool by niche, level and proven competency — build shortlists that close." />
      <p className="text-sm text-muted -mt-4 mb-8">Signed in as <b className="text-ink">{first}</b></p>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
        <StatCard label="Talent in pool" value={String(poolCount ?? 0)} hint="Competency-assessed and growing" accent />
        <StatCard label="Open roles" value={String(openJobs ?? 0)} hint="Live and being worked" />
        <StatCard label="Pending verifications" value={String(pendingCreds ?? 0)} hint="Credentials awaiting review" />
        <StatCard label="Placements" value={String(placementsThisMonth ?? 0)} hint="This month" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="font-display font-semibold mb-3">Roles needing attention</div>
          {(recentJobs ?? []).length === 0 ? (
            <p className="text-sm text-muted-2">No open roles right now.</p>
          ) : (
            <div className="space-y-2">
              {(recentJobs ?? []).map((j) => (
                <Link key={j.id} href={`/portal/recruiter/shortlists?job=${j.id}`}
                  className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:border-coral transition">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{j.title}</div>
                    {j.company_name && <div className="text-xs text-muted-2 truncate">{j.company_name}</div>}
                  </div>
                  {(j.openings ?? 1) > 1 && (
                    <span className="text-xs text-muted-2 whitespace-nowrap">{j.hired_count ?? 0}/{j.openings}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="font-display font-semibold mb-3">Where to start</div>
          <div className="space-y-2 text-sm">
            <Link href="/portal/recruiter/pool" className="block rounded-xl border border-line px-4 py-3 hover:border-coral transition">
              <b>Browse the talent pool →</b>
              <div className="text-xs text-muted-2">Filter by niche, level and competency band</div>
            </Link>
            <Link href="/portal/recruiter/shortlists" className="block rounded-xl border border-line px-4 py-3 hover:border-coral transition">
              <b>Work a shortlist →</b>
              <div className="text-xs text-muted-2">Rank applicants and move them through the pipeline</div>
            </Link>
            <Link href="/portal/recruiter/verifications" className="block rounded-xl border border-line px-4 py-3 hover:border-coral transition">
              <b>Clear verifications →</b>
              <div className="text-xs text-muted-2">Confirm credentials so employers can trust the pool</div>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
