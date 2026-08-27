"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type C = {
  id: string; subject: string; audience: string; status: string;
  scheduled_at: string | null; sent_at: string | null;
  recipients: number; sent_count: number; error: string | null;
};

const AUD: Record<string, string> = {
  all_talent: "All talent", elite: "Elite only", niche: "Niche", list: "Pasted list"
};
const BADGE: Record<string, string> = {
  scheduled: "bg-coral-soft text-coral", sending: "bg-ink text-white",
  sent: "bg-paper-2 text-muted", cancelled: "bg-paper-2 text-muted line-through",
  failed: "bg-coral text-white"
};

export function CampaignSchedule({ campaigns }: { campaigns: C[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(mode: string, id: string) {
    setBusy(id); setErr(null);
    const res = await fetch("/api/admin/campaign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, id })
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return; }
    router.refresh();
  }

  if (campaigns.length === 0) return null;

  return (
    <div className="card p-6 mt-6">
      <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-muted mb-4">Scheduled & sent</div>
      <div className="space-y-2">
        {campaigns.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
            <div className="flex-1 min-w-56">
              <div className="text-sm font-semibold truncate">{c.subject}</div>
              <div className="text-xs text-muted-2">
                {AUD[c.audience] ?? c.audience}
                {c.status === "scheduled" && c.scheduled_at && ` · fires ${new Date(c.scheduled_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`}
                {c.status === "sent" && c.sent_at && ` · sent ${new Date(c.sent_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${c.sent_count}/${c.recipients} delivered`}
                {c.status === "failed" && c.error && ` · ${c.error}`}
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-pill text-[11px] font-bold capitalize ${BADGE[c.status] ?? "bg-paper-2"}`}>{c.status}</span>
            {c.status === "scheduled" && (
              <>
                <button className="btn-coral !h-9 text-xs" disabled={busy !== null}
                  onClick={() => act("send_now", c.id)}>{busy === c.id ? "…" : "Send now"}</button>
                <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy !== null}
                  onClick={() => act("cancel", c.id)}>Cancel</button>
              </>
            )}
          </div>
        ))}
      </div>
      {err && <p className="text-coral text-sm mt-3">{err}</p>}
    </div>
  );
}
