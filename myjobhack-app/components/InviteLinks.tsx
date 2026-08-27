"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Link = { id: string; code: string; label: string | null; kind: string; signups: number; active: boolean; created_at: string };

const KIND_LABEL: Record<string, string> = { talent: "Talent", elite: "Elite member", employer: "Employer" };

export function InviteLinks({ links, base }: { links: Link[]; base: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("elite");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function urlFor(l: Link) {
    // ?ref tracks the link; &as sets the registration type
    const asParam = l.kind === "talent" ? "" : `&as=${l.kind}`;
    return `${base}/join?ref=${l.code}${asParam}`;
  }

  async function post(body: any) {
    setBusy(true);
    await fetch("/api/admin/invite-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false); router.refresh();
  }

  function copy(l: Link) {
    navigator.clipboard.writeText(urlFor(l));
    setCopied(l.id); setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Create */}
      <div className="card p-5">
        <div className="font-display font-semibold mb-3">Create an invite link</div>
        <div className="grid sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
          <div>
            <label className="label !text-xs">Invite people as</label>
            <select className="input !h-11" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="elite">Elite member</option>
              <option value="employer">Employer</option>
              <option value="talent">Talent (general)</option>
            </select>
          </div>
          <div>
            <label className="label !text-xs">Label (internal, optional)</label>
            <input className="input !h-11" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Alumni WhatsApp group" />
          </div>
          <button className="btn-coral !h-11" disabled={busy}
            onClick={() => { post({ action: "create", kind, label }); setLabel(""); }}>
            Create link
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {links.length === 0 && <div className="card p-8 text-center text-sm text-muted-2">No invite links yet.</div>}
        {links.map((l) => (
          <div key={l.id} className={`card p-4 ${!l.active ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`px-2.5 py-1 rounded-pill text-xs font-bold ${
                l.kind === "elite" ? "bg-coral text-white" : l.kind === "employer" ? "bg-ink text-white" : "bg-paper-2 text-ink"}`}>
                {KIND_LABEL[l.kind] ?? l.kind}
              </span>
              <div className="flex-1 min-w-0">
                {l.label && <div className="font-semibold text-sm truncate">{l.label}</div>}
                <div className="text-xs text-muted-2 font-mono truncate">{urlFor(l)}</div>
              </div>
              <span className="text-sm text-muted-2 whitespace-nowrap">{l.signups} signup{l.signups === 1 ? "" : "s"}</span>
              <button className="btn-ghost !h-9 text-xs" onClick={() => copy(l)}>
                {copied === l.id ? "Copied ✓" : "Copy link"}
              </button>
              <button className="btn-ghost !h-9 text-xs" onClick={() => post({ action: "toggle", id: l.id })}>
                {l.active ? "Disable" : "Enable"}
              </button>
              <button className="text-muted-2 hover:text-coral text-sm px-1" onClick={() => post({ action: "delete", id: l.id })}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
