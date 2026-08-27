import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DashHero } from "@/components/DashHero";
import { TopicComposer, CATEGORIES } from "@/components/Commons";
import { timeAgo } from "@/components/Spark";

export default async function CommonsPage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("elite_memberships")
    .select("status").eq("talent_id", user!.id).maybeSingle();
  if (me?.status !== "verified") {
    return <DashHero kicker="The Commons" title="Members only." sub="The room opens when your membership is verified." />;
  }

  let q = supabase.from("forum_topics").select("*")
    .order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(50);
  if (searchParams.c) q = q.eq("category", searchParams.c);
  const { data: topics } = await q;

  const authorIds = Array.from(new Set((topics ?? []).map((t) => t.author_id)));
  const { data: authors } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] as any[] };
  const amap = new Map((authors ?? []).map((a) => [a.id, a.full_name]));

  const topicIds = (topics ?? []).map((t) => t.id);
  const counts = new Map<string, number>();
  if (topicIds.length) {
    const { data: replies } = await supabase.from("forum_replies").select("topic_id").in("topic_id", topicIds);
    (replies ?? []).forEach((r) => counts.set(r.topic_id, (counts.get(r.topic_id) ?? 0) + 1));
  }

  const catLabel = new Map(CATEGORIES.map(([v, l]) => [v, l]));

  return (
    <>
      <DashHero kicker="The Commons" title="The room is talking."
        sub="Discussions, opportunities, and wins — from verified first class minds across the continent." />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <TopicComposer />
        <div className="flex flex-wrap gap-2 ml-auto">
          <Link href="/portal/elite/commons"
            className={`px-4 h-10 inline-flex items-center rounded-pill border text-xs font-bold transition ${
              !searchParams.c ? "bg-ink border-ink text-white" : "border-line hover:border-coral"}`}>All</Link>
          {CATEGORIES.map(([v, l]) => (
            <Link key={v} href={`/portal/elite/commons?c=${v}`}
              className={`px-4 h-10 inline-flex items-center rounded-pill border text-xs font-bold transition ${
                searchParams.c === v ? "bg-ink border-ink text-white" : "border-line hover:border-coral"}`}>{l}</Link>
          ))}
        </div>
      </div>

      {(topics ?? []).length === 0 ? (
        <div className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 p-12 text-center">
          <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-coral/[.14] blur-3xl" />
          <div className="relative">
            <div className="font-display font-semibold text-2xl mb-2">Quiet room, first word.</div>
            <p className="text-white/50 text-sm">Someone has to start every great conversation. Why not you?</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {(topics ?? []).map((t) => (
            <Link key={t.id} href={`/portal/elite/commons/${t.id}`}
              className="group relative overflow-hidden rounded-card bg-ink text-white border border-white/10 hover:border-coral/50 transition p-6 flex items-center gap-5 block">
              <span className="w-11 h-11 rounded-full bg-coral grid place-items-center font-display font-semibold text-lg shrink-0">
                {(amap.get(t.author_id) ?? "?")[0]}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 mb-1">
                  {t.pinned && <span className="px-2 py-0.5 rounded-pill bg-coral text-white text-[9px] font-extrabold uppercase tracking-widest">Pinned</span>}
                  <span className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#FFB4AC]">{catLabel.get(t.category) ?? t.category}</span>
                </span>
                <span className="block font-display font-semibold text-lg truncate group-hover:text-coral transition">{t.title}</span>
                <span className="block text-xs text-white/40 mt-1">
                  {amap.get(t.author_id) ?? "Member"} · {timeAgo(t.created_at)}
                </span>
              </span>
              <span className="text-center shrink-0">
                <span className="block font-display font-semibold text-2xl">{counts.get(t.id) ?? 0}</span>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-white/40">Replies</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
