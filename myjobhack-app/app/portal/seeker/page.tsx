import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MatchedJobs } from "@/components/MatchedJobs";
import { ResumeImportPrompt } from "@/components/ResumeImportPrompt";
import { DashHero } from "@/components/DashHero";
import { StatCard } from "@/components/StatCard";
import { ProgressRing } from "@/components/ProgressRing";

export default async function SeekerDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: talent }, { count: appCount }, { count: inviteCount }, sub, { data: myRole }] =
    await Promise.all([
      supabase.from("profiles").select("full_name, phone, country, city").eq("id", user!.id).single(),
      supabase.from("talent_profiles").select("*").eq("profile_id", user!.id).single(),
      supabase.from("applications").select("*", { count: "exact", head: true }).eq("talent_id", user!.id),
      supabase.from("training_invites").select("*", { count: "exact", head: true }).eq("talent_id", user!.id),
      supabase.from("subscriptions").select("status").eq("profile_id", user!.id).eq("status", "active").maybeSingle(),
      supabase.from("profiles").select("role").eq("id", user!.id).single()
    ]);

  const first = (profile?.full_name || "there").split(" ")[0];
  const pc = talent?.profile_completion ?? 0;

  const checklist = [
    { done: !!(profile?.full_name && profile?.phone && profile?.country), label: "Add your basics" },
    { done: !!(talent?.niche_id && talent?.career_goal_id), label: "Set your niche & career goal" },
    { done: !!(talent?.salary_min && talent?.expected_role_level), label: "Set your expectations" },
    { done: !!talent?.resume_document_id, label: "Upload your resume" }
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const nextStep = checklist.find((c) => !c.done);

  // Someone with a CV on file but no structured work history has a profile
  // employers cannot properly evaluate. They will not find the import button
  // on their own, so surface it here.
  const { count: expCount } = await supabase.from("work_experiences")
    .select("id", { count: "exact", head: true }).eq("talent_id", user!.id);
  const canImportResume = !!talent?.resume_document_id && (expCount ?? 0) === 0;

  const tiles = [
    { href: "/portal/seeker/jobs", title: "Open roles", desc: "Auto-shortlisting works for you", icon: "◎" },
    { href: "/portal/seeker/trainings", title: "Trainings", desc: "Invites that match your skills", icon: "✦" },
    { href: "/portal/seeker/ai-tools", title: "Career Toolkit", desc: sub.data ? "Unlocked — all tools active" : "Subscribe to unlock", icon: "⌁" }
  ];

  return (
    <>
      <DashHero kicker="Your headquarters" title={`Welcome back, ${first}.`}
        sub={pc >= 100
          ? "Your profile is fully matchable — trainings, roles, and invitations are hunting on your behalf."
          : nextStep
            ? `Your profile is doing the job hunting — the stronger it is, the harder it works. Next: ${nextStep.label.toLowerCase()}.`
            : "Your profile is doing the job hunting — the stronger it is, the harder it works."}
        right={<ProgressRing pct={pc} label="Profile" />}>
        {pc < 100 && (
          <Link href="/portal/seeker/profile" className="btn-coral !h-11">Complete profile →</Link>
        )}
      </DashHero>

      <div className="grid sm:grid-cols-3 gap-5 mb-8">
        <StatCard label="Applications" value={appCount ?? 0} hint="Across all roles" />
        <StatCard label="Training invites" value={inviteCount ?? 0} hint="Selected for your skills" />
        <StatCard label="Career Toolkit" value={sub.data ? "Active" : "Locked"} accent={!!sub.data}
          hint={sub.data ? "All tools unlocked" : "Subscribe to unlock all tools"} />
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 mb-8 items-start">
        {/* quick tiles */}
        <div className="grid sm:grid-cols-3 gap-4">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href}
              className="card p-5 group hover:-translate-y-0.5 hover:border-coral transition-all duration-300">
              <span className="w-10 h-10 rounded-full bg-coral-soft text-coral grid place-items-center text-lg mb-4">{t.icon}</span>
              <div className="font-display font-semibold mb-1">{t.title}</div>
              <div className="text-xs text-muted-2 leading-relaxed">{t.desc}</div>
              <div className="text-coral text-sm font-semibold mt-3 opacity-0 group-hover:opacity-100 transition">Open →</div>
            </Link>
          ))}
        </div>

        {/* checklist */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted">Getting matched</div>
            <span className="text-xs font-bold">{doneCount}/{checklist.length}</span>
          </div>
          <div className="space-y-1">
            {checklist.map((c, i) => (
              <Link key={i} href="/portal/seeker/profile"
                className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-paper transition group">
                <span className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                  c.done ? "bg-ink text-white" : "bg-coral-soft text-coral"}`}>
                  {c.done ? "✓" : `0${i + 1}`}
                </span>
                <span className={`text-sm flex-1 ${c.done ? "line-through text-muted-2" : "font-medium"}`}>{c.label}</span>
                {!c.done && <span className="text-coral text-xs font-bold opacity-0 group-hover:opacity-100 transition">Do it →</span>}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {myRole?.role === "job_seeker" && (
        <Link href="/portal/seeker/elite"
          className="relative overflow-hidden p-6 max-w-2xl flex items-center gap-5 rounded-card border border-ink hover:border-coral transition block"
          style={{ backgroundColor: "#083E40", color: "#ffffff" }}>
          <span className="pointer-events-none absolute -top-16 -right-10 w-52 h-52 rounded-full blur-3xl" style={{ backgroundColor: "rgba(252,86,71,.15)" }} />
          <span className="w-11 h-11 rounded-full grid place-items-center text-lg shrink-0" style={{ backgroundColor: "#FC5647" }}>✦</span>
          <span className="flex-1 relative">
            <span className="block font-display font-semibold text-lg" style={{ color: "#ffffff" }}>Finished at the top of your class?</span>
            <span className="block text-sm mt-0.5" style={{ color: "rgba(255,255,255,.6)" }}>Apply for Elite — verified chapters of Africa&rsquo;s best graduates.</span>
          </span>
          <span className="font-semibold text-sm relative" style={{ color: "#FC5647" }}>Apply →</span>
        </Link>
      )}

      <div className="mt-6 max-w-2xl">
        <ResumeImportPrompt />
        {canImportResume && (
          <div className="card p-5 mb-5 border-coral/40" style={{ background: "#FFF4F2" }}>
            <div className="font-display font-semibold text-lg mb-1">
              Your résumé is on file — but employers can't see your experience
            </div>
            <p className="text-sm text-muted-2 mb-4 leading-relaxed">
              Employers here evaluate a structured profile, not a CV attachment. Your work history
              section is empty, so you're being judged on less than you've actually done. We can read
              your roles straight out of the résumé you already uploaded — you just check them.
            </p>
            <Link href="/portal/seeker/experience" className="btn-coral !h-10 text-sm">
              Import my experience →
            </Link>
          </div>
        )}
        <MatchedJobs />
      </div>
    </>
  );
}
