import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DashHero } from "@/components/DashHero";
import { StatCard } from "@/components/StatCard";

export default async function EliteDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: profile }, { data: em }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user!.id).single(),
    supabase.from("elite_memberships").select("*").eq("talent_id", user!.id).maybeSingle()
  ]);
  const { data: chapter } = em?.chapter_id
    ? await supabase.from("chapters").select("city, country").eq("id", em.chapter_id).single()
    : { data: null as any };
  const { count: peers } = em?.chapter_id
    ? await supabase.from("elite_memberships").select("*", { count: "exact", head: true })
        .eq("chapter_id", em.chapter_id).eq("status", "verified")
    : { count: 0 };

  const first = (profile?.full_name || "there").split(" ")[0];
  const memberNo = em?.member_no ? String(em.member_no).padStart(4, "0") : null;
  const year = em?.verified_at ? new Date(em.verified_at).getFullYear() : new Date().getFullYear();

  return (
    <>
      <DashHero kicker="Myjobhack Elite" title={`Welcome to the room, ${first}.`}
        sub="Your chapter, your network, and priority access — Elite membership working for you."
        right={memberNo ? (
          <div className="text-right">
            <div className="numeral !text-5xl text-coral leading-none">№ {memberNo}</div>
            <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-white/45 mt-2">Member number</div>
          </div>
        ) : undefined} />

      <div className="grid lg:grid-cols-[420px_1fr] gap-8 items-start">
        {/* THE MEMBER CARD */}
        <div className="relative">
          <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-card bg-coral/80" />
          <div className="relative rounded-card bg-ink text-white p-7 overflow-hidden border border-white/10">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-coral/20 blur-3xl" />
            <div className="flex items-center justify-between mb-10">
              <span className="font-bold">myjob<span className="text-coral">hack</span></span>
              <span className="text-[10px] font-extrabold uppercase tracking-[.26em] text-[#FFB4AC]">Elite Member</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-coral grid place-items-center mb-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M4.5 12.5L10 18L20 6.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="font-display font-semibold text-2xl">{profile?.full_name}</div>
            <div className="text-sm text-white/55 mb-8">
              {em?.distinction ?? "Elite"} · {chapter ? `${chapter.city} Chapter` : "Chapter pending"}
            </div>
            <div className="flex justify-between text-xs text-white/50 border-t border-white/10 pt-4">
              <span>Member <b className="text-white">№ {memberNo ?? "····"}</b></span>
              <span>Est. <b className="text-white">{year}</b></span>
            </div>
          </div>
        </div>

        <div>
          <div className="grid sm:grid-cols-3 gap-5 mb-8">
            <StatCard label="Membership" accent
              value={em?.status === "verified" ? "Verified" : (em?.status ?? "—")}
              hint={em?.status === "verified" ? "Full access active" : "Verification in review"} />
            <StatCard label="Chapter" value={chapter?.city ?? "—"} hint={chapter?.country ?? "Assigned on verification"} />
            <StatCard label="Chapter peers" value={peers ?? 0} hint="Verified members in your city" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/portal/elite/chapter" className="btn-coral">My chapter →</Link>
            <Link href="/portal/elite/community" className="btn-ghost">Continental directory</Link>
            <Link href="/portal/seeker/jobs" className="btn-ghost">Priority roles</Link>
          </div>
        </div>
      </div>
    </>
  );
}
