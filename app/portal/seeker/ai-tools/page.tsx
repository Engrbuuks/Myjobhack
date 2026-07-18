import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasActiveSubscription } from "@/lib/subscription";
import { PageHeader } from "@/components/PageHeader";

const TOOLS = [
  { href: "/portal/seeker/ai-tools/resume-review", icon: "⌖", title: "Resume Review",
    body: "A brutally honest scan of your resume — every loophole, gap, and weakness employers will see. Diagnosis only; the fixing stays yours." },
  { href: "/portal/seeker/ai-tools/interview-prep", icon: "❝", title: "Interview Preparer",
    body: "Company, role, JD in — a complete prep kit out: your introduction, likely questions with answers, and smart questions to ask back." },
  { href: "/portal/seeker/ai-tools/skills-gap", icon: "△", title: "Skills Gap Analysis",
    body: "Your profile versus what the market is hiring for right now — gaps ranked by priority, with a six-month plan to close them." }
];

export default async function AiToolsHub() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const active = await hasActiveSubscription(user!.id);

  return (
    <>
      <PageHeader
        title="toolkit"
        sub={active ? "All tools unlocked. Every run is saved to your history." : "One subscription unlocks everything below — and every tool we add next."}
        action={!active ? <Link href="/portal/seeker/subscription" className="btn-coral">Unlock the toolkit →</Link> : undefined}
      />
      <div className="grid md:grid-cols-3 gap-5">
        {TOOLS.map((t) => (
          <div key={t.href} className={`card p-6 flex flex-col ${!active ? "opacity-80" : ""}`}>
            <span className="w-11 h-11 rounded-full bg-coral-soft text-coral grid place-items-center text-xl mb-4">{t.icon}</span>
            <div className="font-display font-semibold text-xl mb-2">{t.title}</div>
            <p className="text-sm text-muted flex-1">{t.body}</p>
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