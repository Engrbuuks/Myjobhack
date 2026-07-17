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
      <PageHeader title={`Your teaching studio`} sub="Run external sessions or build LMS courses — the invite engine fills your room with the right learners." />
      <p className="text-sm text-muted -mt-4 mb-8">Signed in as <b className="text-ink">{first}</b></p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-10">
        <StatCard label="Trainings" value="0" hint="External + LMS" accent />
        <StatCard label="Enrolled learners" value="0" hint="Across all trainings" />
        <StatCard label="Completions" value="0" hint="Certificates issued" />
        <StatCard label="Upcoming session" value="—" hint="Nothing scheduled" />
      </div>
      <EmptyState title="This portal goes live layer by layer"
        body="The foundation is running — profile, data, and security are in place. Features land here in the coming build layers." />
    </>
  );
}
