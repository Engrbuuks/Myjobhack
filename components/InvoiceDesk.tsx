"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = { description: string; qty: number; amount: number };
type Invoice = {
  id: string; number: string; client_name: string; client_email: string;
  currency: string; total: number; amount_paid?: number; status: string; created_at: string;
};

function sym0(c: string) { return c === "USD" ? "$" : c === "GBP" ? "£" : "₦"; }

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
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("transfer");
  const [payRef, setPayRef] = useState("");

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://app.myjobhack.co";
  function invoiceUrl(id: string) { return `${appUrl}/invoice/${id}`; }
  function waLink(inv: Invoice) {
    const msg = `Hello ${inv.client_name}, here is your invoice ${inv.number} from MYJOBHACK: ${invoiceUrl(inv.id)}`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  async function recordPayment() {
    if (!payFor) return;
    const json = await call({ action: "record_payment", id: payFor.id, amount: Number(payAmount), method: payMethod, reference: payRef }, payFor.id);
    if (json) {
      setNote(`Payment recorded. Status: ${json.status}.`);
      setPayFor(null); setPayAmount(""); setPayRef(""); setPayMethod("transfer");
    }
  }

  async function receipt(inv: Invoice, send: boolean) {
    const json = await call({ action: "generate_receipt", id: inv.id, send }, inv.id);
    if (json && send) setNote(`Receipt ${json.receipt_number} emailed to ${inv.client_email}.`);
    else if (json && json.html) {
      const w = window.open("", "_blank");
      if (w) { w.document.write(json.html); w.document.close(); }
    }
  }

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
    draft: "bg-coral-soft text-coral", sent: "bg-blue-100 text-blue-700",
    partial: "bg-amber-100 text-amber-700", paid: "bg-green-100 text-green-700",
    void: "bg-paper-2 text-muted line-through"
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
            <div className="text-right">
              <span className={`px-2.5 py-1 rounded-pill text-xs font-bold capitalize ${BADGE[inv.status] ?? "bg-paper-2"}`}>{inv.status}</span>
              {Number(inv.amount_paid) > 0 && Number(inv.amount_paid) < Number(inv.total) && (
                <div className="text-[11px] text-muted-2 mt-1">
                  {sym0(inv.currency)}{Number(inv.amount_paid).toLocaleString()} of {sym0(inv.currency)}{Number(inv.total).toLocaleString()} paid
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {inv.status === "draft" && (
                <button className="btn-coral !h-9 text-xs" disabled={busy !== null}
                  onClick={() => call({ action: "send", id: inv.id }, inv.id)}>{busy === inv.id ? "…" : "Send ✉"}</button>
              )}
              {inv.status !== "draft" && inv.status !== "void" && (
                <button className="btn-ghost !h-9 text-xs" disabled={busy !== null}
                  onClick={() => call({ action: "send", id: inv.id }, inv.id)}>Resend</button>
              )}

              {/* Download — opens the printable invoice; browser saves as PDF */}
              <a className="btn-ghost !h-9 text-xs" href={invoiceUrl(inv.id)} target="_blank" rel="noopener">Download ⤓</a>

              {/* WhatsApp share */}
              <a className="btn-ghost !h-9 text-xs !text-green-700" href={waLink(inv)} target="_blank" rel="noopener">WhatsApp</a>

              {/* Record part / full payment */}
              {inv.status !== "void" && inv.status !== "paid" && (
                <button className="btn-ghost !h-9 text-xs" disabled={busy !== null}
                  onClick={() => { setPayFor(inv); setPayAmount(String(Math.max(0, Number(inv.total) - Number(inv.amount_paid ?? 0)))); }}>
                  + Payment
                </button>
              )}

              {/* Receipt — only once something is paid */}
              {Number(inv.amount_paid) > 0 && (
                <>
                  <button className="btn-ghost !h-9 text-xs" disabled={busy !== null}
                    onClick={() => receipt(inv, false)}>Receipt ⤓</button>
                  <button className="btn-coral !h-9 text-xs" disabled={busy !== null}
                    onClick={() => receipt(inv, true)}>Email receipt</button>
                </>
              )}

              {["draft", "sent"].includes(inv.status) && (
                <button className="text-xs font-semibold text-muted hover:text-coral" disabled={busy !== null}
                  onClick={() => call({ action: "void", id: inv.id }, inv.id)}>Void</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {payFor && (
        <div className="fixed inset-0 bg-ink/50 grid place-items-center z-50 p-4" onClick={() => setPayFor(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-display font-semibold text-lg">Record a payment</h3>
              <p className="text-sm text-muted-2">{payFor.number} · {payFor.client_name}</p>
            </div>
            <div>
              <label className="label">Amount ({sym0(payFor.currency)})</label>
              <input className="input" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
              <p className="text-xs text-muted-2 mt-1">
                Balance: {sym0(payFor.currency)}{(Number(payFor.total) - Number(payFor.amount_paid ?? 0)).toLocaleString()}. Enter less for a part payment.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Method</label>
                <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  <option value="transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="paystack">Paystack</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Reference</label>
                <input className="input" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Teller / txn no." />
              </div>
            </div>
            {err && <p className="text-coral text-sm">{err}</p>}
            <div className="flex gap-3">
              <button className="btn-coral" onClick={recordPayment} disabled={busy !== null}>
                {busy ? "Recording…" : "Record payment"}
              </button>
              <button className="btn-ghost" onClick={() => setPayFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
