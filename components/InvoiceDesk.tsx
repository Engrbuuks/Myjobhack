"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { description: string; qty: number; amount: number };
type Invoice = {
  id: string; number: string; client_name: string; client_email: string;
  currency: string; total: number; status: string; created_at: string;
};

export function InvoiceDesk({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const [openNew, setOpenNew] = useState(invoices.length === 0);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([{ description: "", qty: 1, amount: 0 }]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const sym = currency === "USD" ? "$" : "₦";
  const total = items.reduce((a, i) => a + Number(i.amount) * (Number(i.qty) || 1), 0);

  async function call(body: Record<string, any>, tag: string) {
    setBusy(tag); setErr(null); setNote(null);
    const res = await fetch("/api/admin/invoice", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setErr(json.error); return null; }
    router.refresh(); return json;
  }

  async function create() {
    const json = await call({ action: "create", client_name: clientName, client_email: clientEmail, currency, notes, items }, "create");
    if (json) {
      setNote(`Invoice ${json.number} created — hit Send when ready.`);
      setClientName(""); setClientEmail(""); setNotes(""); setItems([{ description: "", qty: 1, amount: 0 }]);
      setOpenNew(false);
    }
  }

  const BADGE: Record<string, string> = {
    draft: "bg-coral-soft text-coral", sent: "bg-ink text-white",
    paid: "bg-paper-2 text-muted", void: "bg-paper-2 text-muted line-through"
  };

  return (
    <div className="max-w-3xl">
      <button className="btn-coral !h-11 mb-6" onClick={() => setOpenNew(!openNew)}>
        {openNew ? "Close" : "＋ New invoice"}
      </button>

      {openNew && (
        <div className="card p-6 mb-6">
          <div className="grid sm:grid-cols-[1fr_1fr_110px] gap-4 mb-4">
            <div><label className="label">Client / company *</label>
              <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} /></div>
            <div><label className="label">Billing email *</label>
              <input className="input" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} /></div>
            <div><label className="label">Currency</label>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>NGN</option><option>USD</option>
              </select></div>
          </div>
          <label className="label">Line items</label>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_130px_auto] gap-2 mb-2">
              <input className="input !h-10" placeholder="Description — e.g. Managed recruitment, Senior Accountant"
                value={it.description} onChange={(e) => setItems((x) => x.map((y, yi) => yi === i ? { ...y, description: e.target.value } : y))} />
              <input className="input !h-10" type="number" min={1} value={it.qty}
                onChange={(e) => setItems((x) => x.map((y, yi) => yi === i ? { ...y, qty: Number(e.target.value) } : y))} />
              <input className="input !h-10" type="number" placeholder="Amount" value={it.amount || ""}
                onChange={(e) => setItems((x) => x.map((y, yi) => yi === i ? { ...y, amount: Number(e.target.value) } : y))} />
              <button className="text-muted hover:text-coral" onClick={() => setItems((x) => x.filter((_, yi) => yi !== i))}>✕</button>
            </div>
          ))}
          <button className="btn-ghost !h-9 text-xs mb-4" onClick={() => setItems((x) => [...x, { description: "", qty: 1, amount: 0 }])}>＋ Line</button>
          <label className="label">Notes on the invoice (optional)</label>
          <input className="input mb-4" placeholder="e.g. Payment due within 7 days" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex items-center gap-4">
            <button className="btn-coral" onClick={create} disabled={busy !== null}>
              {busy === "create" ? "Creating…" : `Create invoice · ${sym}${total.toLocaleString()}`}
            </button>
            {err && <span className="text-coral text-sm">{err}</span>}
            {note && <span className="text-muted text-sm">{note}</span>}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {invoices.map((inv) => (
          <div key={inv.id} className="card p-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-52">
              <div className="font-semibold text-sm">{inv.number} · {inv.client_name}</div>
              <div className="text-xs text-muted-2">{inv.client_email} · {new Date(inv.created_at).toLocaleDateString()}</div>
            </div>
            <div className="font-display font-semibold text-lg">
              {inv.currency === "USD" ? "$" : "₦"}{Number(inv.total).toLocaleString()}
            </div>
            <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${BADGE[inv.status] ?? "bg-paper-2"}`}>{inv.status}</span>
            {inv.status === "draft" && (
              <button className="btn-coral !h-9 text-xs" disabled={busy !== null}
                onClick={() => call({ action: "send", id: inv.id }, inv.id)}>
                {busy === inv.id ? "…" : "Send ✉"}
              </button>
            )}
            {inv.status === "sent" && (
              <>
                <button className="btn-ghost !h-9 text-xs" disabled={busy !== null}
                  onClick={() => call({ action: "send", id: inv.id }, inv.id)}>Resend</button>
                <button className="btn-coral !h-9 text-xs" disabled={busy !== null}
                  onClick={() => call({ action: "mark_paid", id: inv.id }, inv.id)}>Mark paid ✓</button>
              </>
            )}
            {["draft", "sent"].includes(inv.status) && (
              <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy !== null}
                onClick={() => call({ action: "void", id: inv.id }, inv.id)}>Void</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
