import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";

export default async function PartnerDashboard() {
  const supabase = createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();
  const first = (profile?.full_name || "there").split(" ")[0];
  const nowIso = new Date().toISOString();

  const [{ data: links }, { count: openJobs }, { count: openTrainings }] = await Promise.all([
    admin.from("invite_links").select("id, signups, active").eq("partner_id", user!.id),
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("trainings").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"])
  ]);

  const totalSignups = (links ?? []).reduce((t, l) => t + (l.signups ?? 0), 0);
  const activeLinks = (links ?? []).filter((l) => l.active).length;

  return (
    <>
      <PageHeader title="Partner hub"
        sub="Promote opportunities to your network and track exactly what your referrals bring in." />
      <p className="text-sm text-muted -mt-4 mb-8">Signed in as <b className="text-ink">{first}</b></p>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
        <StatCard label="Referral signups" value={String(totalSignups)} hint="People who joined via your links" accent />
        <StatCard label="Active links" value={String(activeLinks)} hint={`${(links ?? []).length} total`} />
        <StatCard label="Open roles" value={String(openJobs ?? 0)} hint="Available to promote" />
        <StatCard label="Open trainings" value={String(openTrainings ?? 0)} hint="Available to promote" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Link href="/portal/partner/opportunities" className="card p-6 hover:border-coral transition">
          <div className="font-display font-semibold text-lg mb-1">Browse opportunities →</div>
          <p className="text-sm text-muted-2">See every live role and open training you can share with your network.</p>
        </Link>
        <Link href="/portal/partner/referrals" className="card p-6 hover:border-coral transition">
          <div className="font-display font-semibold text-lg mb-1">Manage referral links →</div>
          <p className="text-sm text-muted-2">Create trackable links and see how many people each one brings in.</p>
        </Link>
      </div>
    </>
  );
}
