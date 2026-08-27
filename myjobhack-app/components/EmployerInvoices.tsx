"use client";
import { PayButton } from "@/components/PayButton";

type Row = { id: string; number: string; total: number; status: string; created_at: string; purpose: string; ref: Record<string, any> };

export function EmployerInvoices({ rows }: { rows: Row[] }) {
  if (!rows.length) return <div className="card p-8 text-center text-sm text-muted-2">No invoices yet.</div>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="card p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{r.number}</div>
            <div className="text-xs text-muted-2">{new Date(r.created_at).toLocaleDateString()}</div>
          </div>
          <div className="font-display font-semibold text-lg">₦{r.total.toLocaleString()}</div>
          <span className={`px-2.5 py-1 rounded-pill text-xs font-bold ${
            r.status === "paid" ? "bg-green-100 text-green-700" : "bg-coral-soft text-coral"}`}>
            {r.status}
          </span>
          {r.status !== "paid" && r.purpose !== "invoice" && (
            <PayButton purpose={r.purpose} refData={r.ref} label="Pay with Paystack →" />
          )}
        </div>
      ))}
    </div>
  );
}
