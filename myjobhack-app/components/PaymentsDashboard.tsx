"use client";
import { useState, useEffect } from "react";
import { ExportButton } from "@/components/ExportButton";

type Totals = { all_time: number; this_month: number; last_7: number; count: number; pending_review: number; initiated: number };
type Stream = { label: string; total: number; count: number };
type Txn = { id: string; amount: number; currency: string; method: string; status: string; purpose: string; ref: string; created_at: string; who: string };

const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`card p-5 ${accent ? "border-coral/40" : ""}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-2 mb-1">{label}</div>
      <div className={`font-display font-semibold text-2xl ${accent ? "text-coral" : ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted-2 mt-1">{hint}</div>}
    </div>
  );
}

export function PaymentsDashboard({ totals, streams, recent }: { totals: Totals; streams: Stream[]; recent: Txn[] }) {
  const [health, setHealth] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  async function checkHealth() {
    setChecking(true);
    try {
      const res = await fetch("/api/admin/payments-health");
      setHealth(await res.json());
    } catch { setHealth({ verdict: "Could not run the check." }); }
    setChecking(false);
  }
  useEffect(() => { checkHealth(); }, []);

  const max = Math.max(1, ...streams.map((s) => s.total));

  return (
    <div className="space-y-6">
      {/* Paystack health */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-sm">Paystack status</span>
          {health ? (
            <span className={`px-2.5 py-1 rounded-pill text-xs font-bold ${
              health.key_set && health.paystack_reachable ? "bg-ink text-white" : "bg-coral text-white"}`}>
              {health.key_set ? (health.paystack_reachable ? `Connected · ${health.key_mode}` : "Key rejected") : "Not configured"}
            </span>
          ) : <span className="text-xs text-muted-2">checking…</span>}
          <button className="btn-ghost !h-8 text-xs ml-auto" onClick={checkHealth} disabled={checking}>
            {checking ? "Checking…" : "Re-check"}
          </button>
        </div>
        {health?.verdict && <p className="text-xs text-muted-2 mt-2">{health.verdict}</p>}
        {health?.webhook_url && (
          <p className="text-xs text-muted-2 mt-1">
            Webhook URL (paste into Paystack dashboard): <span className="font-mono">{health.webhook_url}</span>
          </p>
        )}
      </div>

      {/* Headline numbers */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Revenue · all time" value={naira(totals.all_time)} hint={`${totals.count} confirmed payments`} accent />
        <Stat label="This month" value={naira(totals.this_month)} />
        <Stat label="Last 7 days" value={naira(totals.last_7)} />
        <Stat label="Needs attention" value={`${totals.pending_review}`} hint={`${totals.initiated} started but unpaid`} />
      </div>

      {/* Revenue streams */}
      <div className="card p-5">
        <div className="font-display font-semibold mb-3">Where the money comes from</div>
        {streams.length === 0 ? (
          <p className="text-sm text-muted-2">No confirmed revenue yet.</p>
        ) : (
          <div className="space-y-3">
            {streams.map((s) => (
              <div key={s.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-2">{naira(s.total)} · {s.count}</span>
                </div>
                <div className="h-2 rounded-full bg-paper-2 overflow-hidden">
                  <div className="h-full bg-coral rounded-full" style={{ width: `${Math.round((s.total / max) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display font-semibold">Recent transactions</div>
          <ExportButton rows={recent as any} filename="payments" label="Export" />
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-2">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-muted-2">
                  <th className="py-2">Who</th><th>Purpose</th><th>Amount</th><th>Method</th><th>Status</th><th>When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-2.5 pr-3 truncate max-w-[180px]">{t.who}</td>
                    <td className="pr-3 text-muted-2">{t.purpose}</td>
                    <td className="pr-3 font-semibold">{naira(t.amount)}</td>
                    <td className="pr-3 text-muted-2 capitalize">{t.method}</td>
                    <td className="pr-3">
                      <span className={`px-2 py-0.5 rounded-pill text-[10px] font-bold uppercase ${
                        t.status === "confirmed" ? "bg-ink text-white" :
                        t.status === "pending_review" ? "bg-coral text-white" : "bg-paper-2 text-muted"}`}>
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="text-muted-2 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
