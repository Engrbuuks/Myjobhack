import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Join MYJOBHACK — free profile, real roles across Africa",
  description: "Create a free profile in two minutes. Get matched to verified roles, invited to skill trainings, and shortlisted automatically when you qualify.",
  openGraph: {
    title: "Your next role is looking for you.",
    description: "Free profile. Verified employers. Auto-shortlisting when you qualify.",
    type: "website"
  },
  alternates: { canonical: "https://app.myjobhack.co/join" }
};

export default async function JoinPage({ searchParams }: { searchParams: { ref?: string } }) {
  const admin = createAdminClient();
  const [{ count: talentCount }, { data: jobs }] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }).in("role", ["job_seeker", "elite_member"]),
    admin.from("jobs").select("id, title, location, work_mode, org_id")
      .eq("status", "published").order("published_at", { ascending: false }).limit(4)
  ]);
  const signupHref = searchParams.ref ? `/signup?ref=${encodeURIComponent(searchParams.ref)}` : "/signup";

  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <a href="https://myjobhack.co" className="font-bold text-lg tracking-tight">myjob<span className="text-coral">hack</span></a>
          <Link href="/login" className="text-sm font-semibold text-white/60 hover:text-white transition">Sign in</Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 right-[5%] w-[560px] h-[560px] rounded-full bg-coral/[.14] blur-3xl" />
        <div className="pointer-events-none absolute top-60 -left-32 w-80 h-80 rounded-full bg-coral/[.07] blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-14 grid lg:grid-cols-[1.1fr_.9fr] gap-14 items-center">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[.26em] text-[#FFB4AC] mb-5">
              Free forever · Two minutes
            </div>
            <h1 className="font-display font-semibold text-[clamp(34px,6vw,60px)] leading-[1.03] mb-6">
              Your next role is <span className="text-coral">looking for you.</span>
            </h1>
            <p className="text-white/60 text-lg leading-relaxed max-w-lg mb-8">
              Build one profile. Get matched to verified roles, invited to trainings that raise your ceiling, and shortlisted the moment you qualify — no applications disappearing into silence.
            </p>
            <div className="flex flex-wrap gap-3 mb-8">
              <Link href={signupHref} className="btn-coral !h-14 !px-8 text-base">Create my free profile →</Link>
              <Link href="/roles" className="inline-flex items-center px-7 h-14 rounded-pill border border-white/20 text-sm font-bold hover:border-coral transition">
                See open roles
              </Link>
            </div>
            {(talentCount ?? 0) > 0 && (
              <p className="text-sm text-white/40">
                <b className="text-white">{talentCount?.toLocaleString()}</b> professionals have already built theirs.
              </p>
            )}
          </div>

          <div className="relative rounded-card border border-white/10 bg-white/[.04] p-7">
            <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-5">What you get, free</div>
            <div className="space-y-5">
              {[["◴", "A profile that works while you sleep", "Employers filter by skill and niche — you surface without applying."],
                ["◈", "Auto-shortlisting, not black holes", "Meet a role's requirements and you're shortlisted instantly."],
                ["▶", "Training invitations", "Curated sessions and courses matched to your niche, with certificates."],
                ["✦", "The Career Toolkit", "Resume review, interview prep, and skills-gap analysis when you want an edge."]
              ].map(([icon, t, d]) => (
                <div key={t} className="flex gap-4">
                  <span className="w-9 h-9 rounded-full bg-coral/20 text-coral grid place-items-center shrink-0">{icon}</span>
                  <div>
                    <div className="font-semibold text-sm mb-0.5">{t}</div>
                    <div className="text-[13px] text-white/50 leading-relaxed">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {(jobs ?? []).length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-14 border-t border-white/10">
          <div className="text-[11px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-6">Hiring right now</div>
          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {(jobs ?? []).map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`}
                className="group rounded-card border border-white/10 hover:border-coral/50 transition p-5 flex items-center gap-4">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate group-hover:text-coral transition">{j.title}</span>
                  <span className="block text-xs text-white/40 mt-1 capitalize">
                    {[j.location, j.work_mode].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-coral text-sm font-bold shrink-0">View →</span>
              </Link>
            ))}
          </div>
          <Link href="/roles" className="text-sm font-bold text-coral">See every open role →</Link>
        </section>
      )}

      <section className="max-w-6xl mx-auto px-6 py-16 border-t border-white/10">
        <div className="grid sm:grid-cols-3 gap-8">
          {[["01", "Build your profile", "Niche, experience, resume. Two minutes, once."],
            ["02", "Get matched", "Roles and trainings find you — apply in one click when they fit."],
            ["03", "Arrive ready", "Certificates, prepared interviews, a resume that survives scrutiny."]
          ].map(([n, t, d]) => (
            <div key={n}>
              <div className="font-display font-semibold text-coral text-2xl mb-2">{n}</div>
              <div className="font-semibold mb-1">{t}</div>
              <div className="text-sm text-white/50 leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href={signupHref} className="btn-coral !h-14 !px-9 text-base">Start — it's free →</Link>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/35">
        MYJOBHACK — Africa's workforce, transformed. <a href="https://myjobhack.co" className="text-coral font-semibold">myjobhack.co</a>
      </footer>
    </div>
  );
}
