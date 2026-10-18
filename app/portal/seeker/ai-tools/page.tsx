import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasActiveSubscription } from "@/lib/subscription";
import { PageHeader } from "@/components/PageHeader";
import { toolkitUsage, TOOL_DB } from "@/lib/ai-gate";

const TOOLS = [
  { href: "/portal/seeker/ai-tools/resume-review", slug: "resume-review", icon: "⌖", title: "Resume Review",
    body: "A brutally honest scan of your resume — every loophole, gap, and weakness employers will see. Diagnosis only; the fixing stays yours." },
  { href: "/portal/seeker/ai-tools/interview-prep", slug: "interview-prep", icon: "❝", title: "Interview Preparer",
    body: "Company, role, JD in — a complete prep kit out: your introduction, likely questions with answers, and smart questions to ask back." },
  { href: "/portal/seeker/ai-tools/skills-gap", slug: "skills-gap", icon: "△", title: "Skills Gap Analysis",
    body: "Your profile versus what the market is hiring for right now — gaps ranked by priority, with a six-month plan to close them." }
];

export default async function AiToolsHub() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const active = await hasActiveSubscription(user!.id);

  /**
   * What is left of the allowance, shown BEFORE anything is spent.
   *
   * The toolkit has always been metered and the page never said so, which
   * turned an ordinary budget into what looked like a broken tool the moment
   * somebody reached the limit. A visible balance is a budget; an invisible
   * one is an ambush.
   */
  const usage = active ? await toolkitUsage(user!.id) : null;

  // The toolkit is now the improvement layer for competency assessment.
  const { data: tp } = await supabase.from("talent_profiles")
    .select("competency_band, competency_field").eq("profile_id", user!.id).maybeSingle();
  /**
   * The candidate's own skill gaps, read with the service role and scoped to
   * their own assessments by the filter below.
   *
   * WHY NOT THE USER CLIENT: migration 0058 stops a candidate reading an
   * assessment_scores row until a human has confirmed it, because the row also
   * carries the mark, the reviewer's private note and the anti cheat flags,
   * and a candidate was being shown all three, including being told they had
   * been flagged as suspicious. Row level security cannot hand over one column
   * and withhold another, so the one legitimate reader of a benign column
   * fetches it here instead. The talent_id filter is what keeps this to the
   * signed in person.
   */
  let gaps: string[] = [];
  if (user?.id) {
    const admin = createAdminClient();
    const { data: lastScore } = await admin.from("assessment_scores")
      .select("gaps, assessment_id, assessments!inner(talent_id)")
      .eq("assessments.talent_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lastScore?.gaps) gaps = lastScore.gaps as string[];
  }

  return (
    <>
      <PageHeader
        title="toolkit"
        sub={active ? "All tools unlocked. Every run is saved to your history." : "One subscription unlocks everything below — and every tool we add next."}
        action={!active ? <Link href="/portal/seeker/subscription" className="btn-coral">Unlock the toolkit →</Link> : undefined}
      />
      {usage && (
        <div className="card p-5 mb-6 flex flex-wrap items-center gap-x-10 gap-y-3">
          <div className="text-sm">
            <strong className="text-ink text-lg">{usage.monthly.left}</strong>
            <span className="text-muted-2"> of {usage.monthly.limit} credits left this month</span>
          </div>
          <div className="text-sm text-muted-2">
            Refills {usage.resetsOn} &middot; {usage.daily.left} of {usage.daily.limit} left today
          </div>
          {usage.tier === "subscriber" ? (
            <Link href="/portal/seeker/elite" className="text-sm font-semibold text-coral ml-auto">
              Elite members get more &rarr;
            </Link>
          ) : (
            <span className="text-xs font-bold uppercase tracking-[.16em] text-coral ml-auto">Elite allowance</span>
          )}
        </div>
      )}
      {gaps.length > 0 ? (
        <div className="card p-6 mb-6 border-coral/30" style={{ background: "linear-gradient(120deg,#fff,#FFF4F2)" }}>
          <div className="text-sm font-bold uppercase tracking-wide text-coral mb-2">From your competency assessment</div>
          <div className="font-display font-semibold text-lg mb-1">Close these gaps to raise your band</div>
          <p className="text-sm text-muted-2 mb-3">Your {tp?.competency_field} assessment flagged these areas. The tools below are how you improve them, then retake to lift your score.</p>
          <ul className="text-sm space-y-1 mb-4">{gaps.slice(0, 5).map((g, i) => <li key={i}>→ {g}</li>)}</ul>
          <Link href="/portal/seeker/assessment" className="text-coral font-semibold text-sm">Retake assessment when ready →</Link>
        </div>
      ) : (
        <div className="card p-6 mb-6">
          <div className="font-display font-semibold text-lg mb-1">Haven't proven your competency yet?</div>
          <p className="text-sm text-muted-2 mb-3">Take your assessment first — it tells you exactly which tools to use, then employers can see your verified band.</p>
          <Link href="/portal/seeker/assessment" className="btn-coral !h-10 text-sm inline-flex">Take my assessment →</Link>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        {TOOLS.map((t) => (
          <div key={t.href} className={`card p-6 flex flex-col ${!active ? "opacity-80" : ""}`}>
            <span className="w-11 h-11 rounded-full bg-coral-soft text-coral grid place-items-center text-xl mb-4">{t.icon}</span>
            <div className="font-display font-semibold text-xl mb-2">{t.title}</div>
            <p className="text-sm text-muted flex-1">{t.body}</p>
            {usage && (
              <div className="text-xs text-muted-2 mt-3">
                {usage.weights[TOOL_DB[t.slug]] ?? 1} credit{(usage.weights[TOOL_DB[t.slug]] ?? 1) === 1 ? "" : "s"} a run
              </div>
            )}
            {active ? (
              <Link href={t.href} className="btn-coral mt-5 justify-center">Open →</Link>
            ) : (
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-2">🔒 Requires subscription</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-2 mt-10 max-w-xl leading-relaxed">
        Fair use: the Toolkit is personal — every tool runs on the resume and profile of the signed-in member, with daily allowances per tool. Accounts operating as review or prep services for others are suspended.
      </p>
    </>
  );
}