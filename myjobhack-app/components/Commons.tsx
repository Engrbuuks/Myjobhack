"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const CATEGORIES = [
  ["general", "The floor"], ["opportunities", "Opportunities"],
  ["wins", "Wins"], ["ask", "Ask the room"]
] as const;

export function TopicComposer() {
  const router = useRouter();
  const [openC, setOpenC] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post() {
    if (!title.trim()) { setErr("Give it a title"); return; }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("forum_topics")
      .insert({ author_id: user!.id, title: title.trim(), body: body.trim(), category });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setTitle(""); setBody(""); setOpenC(false); router.refresh();
  }

  if (!openC) {
    return <button className="btn-coral !h-11" onClick={() => setOpenC(true)}>✦ Start a discussion</button>;
  }
  return (
    <div className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 p-6 w-full">
      <div className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-coral/[.14] blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map(([v, l]) => (
            <button key={v} type="button"
              className={`px-4 h-9 rounded-pill border text-xs font-bold transition ${
                category === v ? "bg-coral border-coral text-white" : "border-white/20 text-white/60 hover:border-coral"}`}
              onClick={() => setCategory(v)}>{l}</button>
          ))}
        </div>
        <input
          className="w-full bg-transparent font-display font-semibold text-2xl outline-none placeholder:text-white/25 border-b border-white/10 focus:border-coral/50 transition pb-2 mb-4"
          placeholder="What's on your mind?"
          value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className="w-full bg-white/[.06] rounded-xl p-4 text-sm outline-none placeholder:text-white/25 border border-white/10 focus:border-coral/40 transition mb-4"
          rows={4} placeholder="Set the scene — the room is listening…"
          value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex items-center gap-3">
          <button className="btn-coral !h-11" onClick={post} disabled={busy}>
            {busy ? "Posting…" : "Post to the room →"}
          </button>
          <button className="text-sm text-white/50 hover:text-white" onClick={() => setOpenC(false)}>Cancel</button>
          {err && <span className="text-coral text-sm">{err}</span>}
        </div>
      </div>
    </div>
  );
}

export function ReplyBox({ topicId }: { topicId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function reply() {
    if (!body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("forum_replies").insert({ topic_id: topicId, author_id: user!.id, body: body.trim() });
    setBody(""); setBusy(false); router.refresh();
  }
  return (
    <div className="relative overflow-hidden rounded-card bg-ink text-white border border-white/10 p-5">
      <textarea
        className="w-full bg-white/[.06] rounded-xl p-4 text-sm outline-none placeholder:text-white/25 border border-white/10 focus:border-coral/40 transition mb-3"
        rows={3} placeholder="Add your voice…"
        value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn-coral !h-10" onClick={reply} disabled={busy || !body.trim()}>
        {busy ? "…" : "Reply →"}
      </button>
    </div>
  );
}
