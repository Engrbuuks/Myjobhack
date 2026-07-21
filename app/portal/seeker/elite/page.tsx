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
      {!existing && (
        <div className="mb-8 max-w-3xl">
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              ["✦", "Priority to employers", "Elite members surface first when employers search the pool — above the general list."],
              ["◈", "Verified distinction badge", "A mark employers trust: you were reviewed and confirmed as top-tier, not self-declared."],
              ["◎", "Free competency assessments", "Unlimited retakes to lift your band — included, where others pay per assessment."],
              ["❝", "Full career toolkit", "Every AI tool unlocked: resume review, interview prep, skills-gap planning."],
              ["⬡", "Local chapters, global network", "Meet other verified members in your city; collaborate and refer across Africa."],
              ["➤", "First access to roles", "Curated senior and hard-to-find roles go to Elite members before the public board."]
            ].map(([icon, title, body]) => (
              <div key={title} className="card p-5">
                <span className="w-9 h-9 rounded-full bg-coral-soft text-coral grid place-items-center mb-3">{icon}</span>
                <div className="font-semibold mb-1">{title}</div>
                <p className="text-sm text-muted-2">{body}</p>
              </div>
            ))}
          </div>
          <div className="card p-5 mt-4 flex flex-wrap items-center justify-between gap-4" style={{ background: "linear-gradient(120deg,#fff,#FFF4F2)" }}>
            <div>
              <div className="font-display font-semibold text-lg">Membership</div>
              <p className="text-sm text-muted-2">By review and verification. Premium tier unlocks the full toolkit and unlimited assessments.</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-display font-semibold">₦5,000<span className="text-sm text-muted-2">/mo</span></div>
              <div className="text-xs text-muted-2">or verified-free tier by merit</div>
            </div>
          </div>
        </div>
      )}
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
