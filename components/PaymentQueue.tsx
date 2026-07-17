"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string; amount: number; currency: string; method: string;
  provider_ref: string | null; created_at: string;
  name: string; email: string; proofUrl: string | null;
};

export function PaymentQueue({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(id: string, action: "confirm" | "reject") {
    setBusy(id); setErr(null);
    const res = await fetch("/api/admin/payments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_id: id, action })
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return; }
    router.refresh();
  }

  if (rows.length === 0)
    return <div className="card p-10 text-center text-sm text-muted">Queue is clear. Manual transfers appear here for one-click confirmation. ✓</div>;

  return (
    <div className="space-y-3 max-w-3xl">
      {err && <p className="text-coral text-sm">{err}</p>}
      {rows.map((r) => (
        <div key={r.id} className="card p-5 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-52">
            <div className="font-semibold text-sm">{r.name} <span className="text-muted-2 font-normal">· {r.email}</span></div>
            <div className="text-xs text-muted-2 mt-0.5">
              {new Date(r.created_at).toLocaleString()} · {r.method.replace(/_/g, " ")}
              {r.provider_ref ? ` · ref: ${r.provider_ref}` : ""}
            </div>
          </div>
          <div className="font-display font-semibold text-xl">
            {r.currency === "NGN" ? "₦" : "$"}{Number(r.amount).toLocaleString()}
          </div>
          {r.proofUrl && (
            <a href={r.proofUrl} target="_blank" rel="noopener" className="btn-ghost !h-10">View proof</a>
          )}
          <button className="btn-coral !h-10" disabled={busy === r.id} onClick={() => act(r.id, "confirm")}>
            {busy === r.id ? "…" : "Confirm ✓"}
          </button>
          <button className="text-sm font-semibold text-muted hover:text-coral" disabled={busy === r.id}
            onClick={() => act(r.id, "reject")}>Reject</button>
        </div>
      ))}
    </div>
  );
}
