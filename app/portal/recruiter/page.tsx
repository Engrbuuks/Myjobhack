import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";

export default async function Page() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();
  const first = (profile?.full_name || "there").split(" ")[0];

  return (
    <>
      <PageHeader title={`The talent floor`} sub="Slice the pool by niche, goal, expertise, and expectation — build shortlists that close." />
      <p className="text-sm text-muted -mt-4 mb-8">Signed in as <b className="text-ink">{first}</b></p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
        <StatCard label="Talent in pool" value="0" hint="Growing daily" accent />
        <StatCard label="Active jobs" value="0" hint="Roles being worked" />
        <StatCard label="Pending verifications" value="0" hint="Credentials awaiting review" />
        <StatCard label="Placements" value="0" hint="This month" />
      </div>
      <EmptyState title="This portal goes live layer by layer"
        body="The foundation is running — profile, data, and security are in place. Features land here in the coming build layers." />
    </>
  );
}
