import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReplyBox } from "@/components/Commons";
import { ConnectButton } from "@/components/ConnectButton";
import { timeAgo } from "@/components/Spark";

export default async function TopicPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: topic } = await supabase.from("forum_topics").select("*").eq("id", params.id).single();
  if (!topic) return <div className="text-sm text-muted">Topic not found.</div>;

  const { data: replies } = await supabase.from("forum_replies")
    .select("*").eq("topic_id", params.id).order("created_at");

  const authorIds = Array.from(new Set([topic.author_id, ...(replies ?? []).map((r) => r.author_id)]));
  const [{ data: authors }, { data: talents }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", authorIds),
    supabase.from("talent_profiles").select("profile_id, headline").in("profile_id", authorIds)
  ]);
  const amap = new Map((authors ?? []).map((a) => [a.id, a.full_name]));
  const hmap = new Map((talents ?? []).map((t) => [t.profile_id, t.headline]));

  const Person = ({ id, when }: { id: string; when: string }) => (
    <div className="flex items-center gap-3">
      <span className="w-10 h-10 rounded-full bg-coral grid place-items-center font-display font-semibold shrink-0">
        {(amap.get(id) ?? "?")[0]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{amap.get(id) ?? "Member"}</div>
        <div className="text-[11px] text-white/40 truncate">{hmap.get(id) ?? "Elite member"} · {timeAgo(when)}</div>
      </div>
      {id !== user!.id && <ConnectButton recipientId={id} compact />}
    </div>
  );

  return (
    <div className="max-w-3xl">
      <Link href="/portal/elite/commons" className="text-sm font-semibold text-muted hover:text-coral transition">← The Commons</Link>

      <div className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 p-7 mt-4 mb-6">
        <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-coral/[.15] blur-3xl" />
        <div className="relative">
          <h1 className="font-display font-semibold text-[clamp(22px,3.4vw,32px)] leading-tight mb-4">{topic.title}</h1>
          {topic.body && <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap mb-6">{topic.body}</p>}
          <Person id={topic.author_id} when={topic.created_at} />
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {(replies ?? []).map((r) => (
          <div key={r.id} className="rounded-card bg-ink text-white border border-white/10 p-5">
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap mb-4">{r.body}</p>
            <Person id={r.author_id} when={r.created_at} />
          </div>
        ))}
      </div>

      <ReplyBox topicId={params.id} />
    </div>
  );
}
