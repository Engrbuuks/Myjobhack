import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { EliteApply } from "@/components/EliteApply";

export default async function SeekerElite() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: existing }, { data: chapters }] = await Promise.all([
    supabase.from("elite_memberships").select("status").eq("talent_id", user!.id).maybeSingle(),
    supabase.from("chapters").select("id, city, country").eq("active", true).order("city")
  ]);

  return (
    <>
      <PageHeader title="MYJOBHACK Elite"
        sub="For Africa's first class minds — verified chapters, meeting locally, collaborating globally. Membership is by review and verification." />
      {existing ? (
        <div className="card p-8 max-w-lg text-sm">
          <b>Application status:</b>{" "}
          <span className="capitalize font-semibold text-coral">{existing.status.replace(/_/g, " ")}</span>
          <p className="text-muted mt-2">
            {existing.status === "rejected"
              ? "This application wasn't approved. If you believe this is an error, contact the team."
              : "Verification is in progress — your portal transforms the moment you're confirmed."}
          </p>
        </div>
      ) : (
        <EliteApply chapters={chapters ?? []} />
      )}
    </>
  );
}
