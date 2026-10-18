import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { EliteApply } from "@/components/EliteApply";
import { PayButton } from "@/components/PayButton";
import { getPricing } from "@/lib/pricing";
import { eliteSettings } from "@/lib/elite";

export default async function SeekerElite() {
  // The numbers on this page come from the same settings the code enforces,
  // so the page cannot drift away from what actually happens again.
  const [pricing, settings] = await Promise.all([getPricing(), eliteSettings()]);
  const eliteCredits = settings.toolkit_credits.elite.monthly;
  const slaDays = settings.sla_days;
  const earlyHours = settings.early_access_hours;

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
            {/*
              EVERY LINE HERE IS NOW TRUE, and two of them were not.
              "Priority to employers" and "first access to roles" were sold
              for months with nothing behind them: no query ordered by
              membership and no column held a role back. Both are built now,
              so the claims name the mechanism and the member can check it.
              The assessment and toolkit lines say the real numbers instead
              of "unlimited", which was never what the code did.
            */}
            {[
              ["✦", "Priority to employers",
                `Shown to employers as their own block above the general list, labelled as verified, whenever they search for candidates.`],
              ["◈", "Verified distinction badge",
                "Reviewed and confirmed by our team, never self declared. Carry it off the platform with a public page, a code and a letter anyone can check."],
              ["◎", `${pricing.elite_free_assessments} free competency assessments`,
                "Included, where others pay per assessment. Retakes beyond that are on the premium track, and you always see how many are left."],
              ["❝", "The full career toolkit",
                `Every AI tool unlocked, with ${eliteCredits} credits a month rather than an unlimited claim nobody could keep. Resume review, interview prep, skills gap planning.`],
              ["⬡", "Local chapters, global network",
                "Your city chapter with meetups you can RSVP to, and the continental directory for everyone else."],
              ["➤", "First access to roles",
                `Selected roles are held back from the public board, the job page and search for up to ${earlyHours} hours. You see them and can apply before anyone else.`],
              ["⏱", "An answer, guaranteed",
                `Every application you make carries a ${slaDays} working day answer deadline, visible to you and to the employer. A decision either way, not silence.`],
              ["₦", "What the market really pays",
                "A salary benchmark computed from placements we actually recorded, members only. No surveys, no estimates, nothing invented."]
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
              <p className="text-sm text-muted-2">
                By academic distinction, and verified before anything is granted. The free tier carries the badge,
                the chapter, the directory, priority and early access. Premium adds the toolkit and the
                assessment retakes.
              </p>
            </div>
            <div className="text-right">
              {/* From pricing settings, not typed in. A price in two places
                  is a price that will disagree with itself. */}
              <div className="text-2xl font-display font-semibold">
                &#8358;{pricing.elite_premium_ngn.toLocaleString()}<span className="text-sm text-muted-2">/mo</span>
              </div>
              <div className="text-xs text-muted-2 mb-2">or verified-free tier by merit</div>
              <PayButton purpose="elite_premium" refData={{}} label="Go premium →" className="btn-coral !h-9 text-sm inline-flex" />
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
