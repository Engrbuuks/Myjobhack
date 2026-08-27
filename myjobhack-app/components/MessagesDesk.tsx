"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Conn = {
  id: string; status: string; incoming: boolean;
  otherId: string; otherName: string; otherHeadline: string;
};
type Msg = { id: string; sender_id: string; body: string; created_at: string };

export function MessagesDesk({ connections, meId }: { connections: Conn[]; meId: string }) {
  const router = useRouter();
  const accepted = connections.filter((c) => c.status === "accepted");
  const pendingIn = connections.filter((c) => c.status === "pending" && c.incoming);
  const pendingOut = connections.filter((c) => c.status === "pending" && !c.incoming);
  const [activeId, setActiveId] = useState<string | null>(accepted[0]?.id ?? null);
  const active = accepted.find((c) => c.id === activeId) ?? null;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function loadMessages(connId: string) {
    const supabase = createClient();
    const { data } = await supabase.from("dm_messages")
      .select("*").eq("connection_id", connId).order("created_at").limit(200);
    setMessages(data ?? []);
  }
  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    const t = setInterval(() => loadMessages(activeId), 8000);
    return () => clearInterval(t);
  }, [activeId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function respond(id: string, accept: boolean) {
    await fetch("/api/elite/community", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "respond", id, accept })
    });
    router.refresh();
  }
  async function send() {
    if (!draft.trim() || !activeId) return;
    setBusy(true);
    const res = await fetch("/api/elite/community", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "message", connection_id: activeId, body: draft })
    });
    setBusy(false);
    if (res.ok) { setDraft(""); loadMessages(activeId); }
  }

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
      {/* left: requests + threads */}
      <div className="space-y-4">
        {pendingIn.length > 0 && (
          <div className="rounded-card bg-ink text-white border border-coral/40 p-5">
            <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#FFB4AC] mb-3">
              Requests — your consent required
            </div>
            <div className="space-y-3">
              {pendingIn.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-coral grid place-items-center font-display font-semibold shrink-0">{c.otherName[0]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{c.otherName}</div>
                    <div className="text-[11px] text-white/40 truncate">{c.otherHeadline}</div>
                  </div>
                  <button className="px-3 h-8 rounded-pill bg-coral text-white text-[11px] font-bold" onClick={() => respond(c.id, true)}>Accept</button>
                  <button className="px-2 h-8 text-[11px] font-bold text-white/50 hover:text-white" onClick={() => respond(c.id, false)}>Decline</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-card bg-ink text-white border border-white/10 p-3">
          <div className="text-[10px] font-extrabold uppercase tracking-[.22em] text-white/40 px-2 py-2">Conversations</div>
          {accepted.length === 0 ? (
            <p className="text-sm text-white/40 px-2 pb-3">
              No open lines yet. Request a connection from the directory or The Commons — messaging opens when both sides consent.
            </p>
          ) : accepted.map((c) => (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                activeId === c.id ? "bg-coral/20" : "hover:bg-white/[.06]"}`}>
              <span className="w-9 h-9 rounded-full bg-coral grid place-items-center font-display font-semibold shrink-0">{c.otherName[0]}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{c.otherName}</span>
                <span className="block text-[11px] text-white/40 truncate">{c.otherHeadline}</span>
              </span>
            </button>
          ))}
          {pendingOut.length > 0 && (
            <div className="px-2 pt-2 pb-1 text-[11px] text-white/35">
              Awaiting consent: {pendingOut.map((c) => c.otherName).join(", ")}
            </div>
          )}
        </div>
      </div>

      {/* right: thread */}
      <div className="rounded-card bg-ink text-white border border-white/10 flex flex-col min-h-[520px]">
        {!active ? (
          <div className="flex-1 grid place-items-center p-10 text-center">
            <div>
              <div className="w-12 h-12 rounded-full bg-coral/20 text-coral grid place-items-center text-xl mx-auto mb-4">✉</div>
              <p className="text-sm text-white/45 max-w-xs">Pick a conversation — or start one from the directory.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
              <span className="w-9 h-9 rounded-full bg-coral grid place-items-center font-display font-semibold">{active.otherName[0]}</span>
              <div>
                <div className="text-sm font-semibold">{active.otherName}</div>
                <div className="text-[11px] text-white/40">{active.otherHeadline}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-h-[420px]">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_id === meId ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 text-sm leading-relaxed ${
                    m.sender_id === meId
                      ? "bg-coral text-white rounded-2xl rounded-br-md"
                      : "bg-white/[.08] rounded-2xl rounded-bl-md"}`}>
                    {m.body}
                    <div className={`text-[9px] mt-1 ${m.sender_id === meId ? "text-white/60" : "text-white/35"}`}>
                      {new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="p-4 border-t border-white/10 flex gap-3">
              <input
                className="flex-1 bg-white/[.07] rounded-pill px-5 h-12 text-sm outline-none placeholder:text-white/30 border border-white/10 focus:border-coral/50 transition"
                placeholder="Write a message…"
                value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()} />
              <button className="btn-coral !h-12 !px-6" onClick={send} disabled={busy || !draft.trim()}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
