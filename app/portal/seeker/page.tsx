import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";

export default async function SeekerDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: profile }, { data: talent }, { count: appCount }, { count: inviteCount }, sub] =
    await Promise.all([
      supabase.from("profiles").select("full_name, phone, country, city").eq("id", user!.id).single(),
      supabase.from("talent_profiles").select("*").eq("profile_id", user!.id).single(),
      supabase.from("applications").select("*", { count: "exact", head: true }).eq("talent_id", user!.id),
      supabase.from("training_invites").select("*", { count: "exact", head: true }).eq("talent_id", user!.id),
      supabase.from("subscriptions").select("status").eq("profile_id", user!.id).eq("status", "active").maybeSingle()
    ]);

  const first = (profile?.full_name || "there").split(" ")[0];
  const pc = talent?.profile_completion ?? 0;

  const checklist = [
    { done: !!(profile?.full_name && profile?.phone && profile?.country), label: "Add your basics", href: "/portal/seeker/profile" },
    { done: !!(talent?.niche_id && talent?.career_goal_id), label: "Set your niche & career goal", href: "/portal/seeker/profile" },
    { done: !!(talent?.salary_min && talent?.expected_role_level), label: "Set your expectations", href: "/portal/seeker/profile" },
    { done: !!talent?.resume_document_id, label: "Upload your resume", href: "/portal/seeker/profile" }
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <>
      <PageHeader
        title={`Welcome, ${first}`}
        sub="Your career headquarters — profile, applications, trainings, and the AI toolkit in one place."
        action={pc < 100 ? (
          <Link href="/portal/seeker/profile" className="btn-coral">Complete profile →</Link>
        ) : undefined}
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard label="Profile completion" value={`${pc}%`} accent
          hint={pc >= 100 ? "Fully matchable ✓" : "Complete it to get matched"} />
        <StatCard label="Applications" value={appCount ?? 0} hint="Across all roles" />
        <StatCard label="Training invites" value={inviteCount ?? 0} hint="Invites that fit your skills land here" />
        <StatCard label="AI toolkit" value={sub.data ? "Active" : "Locked"}
          hint={sub.data ? "All tools unlocked" : "Subscribe to unlock all tools"} />
      </div>

      {/* onboarding checklist — the sample-1 pattern */}
      <div className="card p-6 max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">Getting matched</span>
          <span className="font-display font-semibold text-lg">{doneCount}/{checklist.length}</span>
        </div>
        <div className="space-y-2">
          {checklist.map((c) => (
            <Link key={c.label} href={c.href}
              className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 hover:border-coral transition">
              <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${
                c.done ? "bg-ink text-white" : "bg-coral-soft text-coral"
              }`}>{c.done ? "✓" : "•"}</span>
              <span className={`text-sm font-medium ${c.done ? "line-through text-muted-2" : ""}`}>{c.label}</span>
              {!c.done && <span className="ml-auto text-coral text-sm font-semibold">Do it →</span>}
            </Link>
          ))}
        </div>
        {pc >= 100 && (
          <p className="text-sm text-muted mt-4">
            Profile complete — our matching team can now put you forward. Watch your email and this dashboard.
          </p>
        )}
      </div>
    </>
  );
}
