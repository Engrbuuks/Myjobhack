"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string; type: "credential" | "elite"; name: string; email: string;
  line1: string; line2: string; docUrl: string | null; created_at: string;
};

export function VerificationQueue({ items, chapters }: {
  items: Item[]; chapters: { id: string; city: string; country: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chapterSel, setChapterSel] = useState<Record<string, string>>({});

  async function act(item: Item, action: "verify" | "reject") {
    setBusy(item.id); setErr(null);
    const res = await fetch("/api/admin/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: item.type, id: item.id, action,
        chapter_id: item.type === "elite" ? chapterSel[item.id] || null : undefined
      })
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return; }
    router.refresh();
  }

  if (items.length === 0)
    return <div className="card p-10 text-center text-sm text-muted">All verification queues are clear. ✓</div>;

  return (
    <div className="space-y-3 max-w-3xl">
      {err && <p className="text-coral text-sm">{err}</p>}
      {items.map((it) => (
        <div key={`${it.type}-${it.id}`} className="card p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className={`px-2.5 py-1 rounded-pill text-[10px] font-bold uppercase tracking-widest ${
              it.type === "elite" ? "bg-ink text-white" : "bg-coral-soft text-coral"}`}>
              {it.type === "elite" ? "Elite" : "Credential"}
            </span>
            <div className="flex-1 min-w-52">
              <div className="font-semibold text-sm">{it.name} <span className="text-muted-2 font-normal">· {it.email}</span></div>
              <div className="text-xs text-muted-2 mt-0.5">{it.line1}{it.line2 ? ` · ${it.line2}` : ""}</div>
            </div>
            {it.docUrl && (
              <a href={it.docUrl} target="_blank" rel="noopener" className="btn-ghost !h-10">View document</a>
            )}
            {it.type === "elite" && (
              <select className="input !h-10 !w-auto text-sm"
                value={chapterSel[it.id] ?? ""}
                onChange={(e) => setChapterSel((c) => ({ ...c, [it.id]: e.target.value }))}>
                <option value="">Assign chapter…</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.city}</option>)}
              </select>
            )}
            <button className="btn-coral !h-10" disabled={busy === it.id} onClick={() => act(it, "verify")}>
              {busy === it.id ? "…" : "Verify ✓"}
            </button>
            <button className="text-sm font-semibold text-muted hover:text-coral" disabled={busy === it.id}
              onClick={() => act(it, "reject")}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
