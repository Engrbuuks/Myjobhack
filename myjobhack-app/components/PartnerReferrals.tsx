"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Link = { id: string; code: string; label: string | null; kind: string; signups: number; active: boolean; created_at: string };
const KIND_LABEL: Record<string, string> = { talent: "Talent", elite: "Elite member", employer: "Employer" };

export function PartnerReferrals({ links, base }: { links: Link[]; base: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("talent");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function urlFor(l: Link) {
    const asParam = l.kind === "talent" ? "" : `&as=${l.kind}`;
    return `${base}/join?ref=${l.code}${asParam}`;
  }

  async function create() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/partner/referral-link", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, label })
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(j.error ?? "Could not create link."); return; }
    setLabel(""); router.refresh();
  }

  function copy(l: Link) {
    navigator.clipboard.writeText(urlFor(l));
    setCopied(l.id); setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="card p-5">
        <div className="font-display font-semibold mb-3">Create a referral link</div>
        <div className="grid sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
          <div>
            <label className="label !text-xs">Refer people as</label>
            <select className="input !h-11" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="talent">Talent</option>
              <option value="elite">Elite member</option>
              <option value="employer">Employer</option>
            </select>
          </div>
          <div>
            <label className="label !text-xs">Label (so you can tell them apart)</label>
            <input className="input !h-11" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My LinkedIn audience" />
          </div>
          <button className="btn-coral !h-11" onClick={create} disabled={busy}>{busy ? "…" : "Create link"}</button>
        </div>
        {err && <p className="text-coral text-sm mt-2">{err}</p>}
      </div>

      <div className="space-y-3">
        {links.length === 0 && <div className="card p-8 text-center text-sm text-muted-2">No referral links yet — create your first above.</div>}
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
              <div className="text-center">
                <div className="font-display font-semibold text-lg">{l.signups ?? 0}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2">signups</div>
              </div>
              <button className="btn-ghost !h-9 text-xs" onClick={() => copy(l)}>
                {copied === l.id ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
