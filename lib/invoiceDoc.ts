/**
 * Modern, bright invoice + receipt HTML.
 * Rendered server-side; used both for on-screen view (browser → Save as PDF)
 * and as the email body. Brand: coral #FC5647, ink #083E40, paper #F7FAFA.
 */

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

const SYM: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

export type InvoiceItem = { description: string; qty: number; amount: number };
export type InvoiceDoc = {
  number: string;
  client_name: string;
  client_email: string;
  currency: string;
  items: InvoiceItem[];
  total: number;
  amount_paid: number;
  status: string;
  notes?: string;
  issued_date?: string;
  due_date?: string | null;
};

const money = (n: number, cur: string) =>
  `${SYM[cur] ?? cur + " "}${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COMPANY = {
  name: "MYJOBHACK",
  tag: "Africa's workforce, transformed.",
  email: "hello@myjobhack.co",
  site: "myjobhack.co",
  bank: "Wema Bank",
  acct: "MYJOBHACK",
  acctno: "0123454711"
};

function shell(inner: string, accentLabel: string, accentColor: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#E4EEED;color:#083E40;padding:28px 16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .doc{max-width:760px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 20px 60px rgba(12,13,17,.10)}
  .top{background:linear-gradient(120deg,#FFFFFF 0%,#EAF4F3 100%);padding:38px 44px 30px;position:relative}
  .top:after{content:"";position:absolute;top:0;right:0;width:240px;height:100%;background:radial-gradient(circle at 90% 20%, rgba(252,86,71,.14), transparent 60%)}
  .brandrow{display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1}
  .logo{height:38px}
  .doctype{text-align:right}
  .doctype .k{display:inline-block;background:${accentColor};color:#fff;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;padding:7px 14px;border-radius:999px}
  .doctype .num{margin-top:10px;font-size:14px;color:#6B6E7B;font-weight:600}
  .meta{display:flex;gap:44px;margin-top:30px;position:relative;z-index:1;flex-wrap:wrap}
  .meta .lbl{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#A0A3AD;margin-bottom:5px}
  .meta .val{font-size:14px;font-weight:600;color:#083E40;line-height:1.45}
  .body{padding:34px 44px 8px}
  table{width:100%;border-collapse:collapse}
  thead th{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#A0A3AD;text-align:left;padding:0 0 12px}
  thead th.r{text-align:right}
  tbody td{padding:15px 0;border-top:1px solid #EFEFF2;font-size:14px;vertical-align:top}
  tbody td.r{text-align:right;font-variant-numeric:tabular-nums}
  tbody td .desc{font-weight:600}
  .totals{margin-top:8px;padding:22px 44px 8px;display:flex;justify-content:flex-end}
  .totals .box{width:280px}
  .totals .row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px;color:#3A3D46}
  .totals .row.grand{border-top:2px solid #083E40;margin-top:8px;padding-top:14px;font-size:19px;font-weight:800;color:#083E40}
  .totals .row.due{color:${accentColor};font-weight:800}
  .pill{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:5px 12px;border-radius:999px}
  .paybox{margin:24px 44px 0;background:#083E40;border-radius:16px;padding:24px 26px;color:#fff;position:relative;overflow:hidden}
  .paybox:after{content:"";position:absolute;top:-40px;right:-30px;width:180px;height:180px;background:radial-gradient(circle,rgba(252,86,71,.35),transparent 65%)}
  .paybox .ph{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#FFB4AC;margin-bottom:14px;position:relative;z-index:1}
  .paygrid{display:flex;gap:34px;flex-wrap:wrap;position:relative;z-index:1}
  .paygrid .cell .k{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8A8C96;margin-bottom:4px}
  .paygrid .cell .v{font-size:16px;font-weight:700;color:#fff}
  .paygrid .cell .v.acct{font-size:22px;letter-spacing:.04em;font-variant-numeric:tabular-nums}
  .payref{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);font-size:12.5px;color:#C9CAD0;position:relative;z-index:1}
  .payref b{color:#FFB4AC}
  .foot{padding:24px 44px 40px;margin-top:20px;background:#F7FAFA;border-top:1px solid #DCEAE9}
  .foot .cols{display:flex;justify-content:space-between;gap:30px;flex-wrap:wrap}
  .foot .lbl{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#A0A3AD;margin-bottom:6px}
  .foot .val{font-size:13px;color:#3A3D46;line-height:1.7}
  .notes{margin-top:20px;font-size:13px;color:#6B6E7B;line-height:1.6}
  .thanks{margin-top:22px;font-size:15px;font-weight:700;color:#083E40}
  @media print{body{background:#fff;padding:0}.doc{box-shadow:none;border-radius:0;max-width:100%}.noprint{display:none!important}}
  .noprint{position:fixed;top:20px;right:20px;display:flex;gap:10px;z-index:99}
  .noprint button{font-family:inherit;font-weight:700;font-size:13px;border:0;border-radius:999px;padding:11px 20px;cursor:pointer}
  .dl{background:#FC5647;color:#fff}
  .pr{background:#083E40;color:#fff}
</style></head><body>
  <div class="noprint">
    <button class="pr" onclick="window.print()">Print</button>
    <button class="dl" onclick="window.print()">Download PDF ⤓</button>
  </div>
  <div class="doc">${inner}</div>
  <script>
    // Nudge mobile users toward the share sheet / print-to-PDF
    document.querySelector('.dl').addEventListener('click', function(){ setTimeout(function(){ window.print(); }, 50); });
  </script>
</body></html>`;
}

export function renderInvoiceHTML(inv: InvoiceDoc): string {
  const cur = inv.currency;
  const rows = inv.items.map((i) => {
    const line = Number(i.amount) * (Number(i.qty) || 1);
    return `<tr><td><div class="desc">${escapeHtml(i.description)}</div></td>
      <td class="r">${i.qty || 1}</td>
      <td class="r">${money(Number(i.amount), cur)}</td>
      <td class="r">${money(line, cur)}</td></tr>`;
  }).join("");

  const due = Math.max(0, inv.total - (inv.amount_paid || 0));
  const statusColor: Record<string, string> = {
    paid: "#16A34A", partial: "#D97706", sent: "#2563EB", draft: "#6B6E7B", void: "#9A9CA6"
  };
  const sc = statusColor[inv.status] ?? "#6B6E7B";

  const inner = `
    <div class="top">
      <div class="brandrow">
        <img class="logo" src="${APP()}/logo-mark.png" alt="MYJOBHACK"/>
        <div class="doctype">
          <span class="k">Invoice</span>
          <div class="num">${inv.number}</div>
        </div>
      </div>
      <div class="meta">
        <div><div class="lbl">Billed to</div><div class="val">${escapeHtml(inv.client_name)}<br>${escapeHtml(inv.client_email)}</div></div>
        <div><div class="lbl">Issued</div><div class="val">${fmtDate(inv.issued_date)}</div></div>
        ${inv.due_date ? `<div><div class="lbl">Due</div><div class="val">${fmtDate(inv.due_date)}</div></div>` : ""}
        <div><div class="lbl">Status</div><div class="val"><span class="pill" style="background:${sc}1a;color:${sc}">${inv.status}</span></div></div>
      </div>
    </div>
    <div class="body">
      <table>
        <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="totals"><div class="box">
      <div class="row"><span>Subtotal</span><span>${money(inv.total, cur)}</span></div>
      ${inv.amount_paid > 0 ? `<div class="row"><span>Paid</span><span>− ${money(inv.amount_paid, cur)}</span></div>` : ""}
      <div class="row grand"><span>Total</span><span>${money(inv.total, cur)}</span></div>
      ${due > 0 && inv.amount_paid > 0 ? `<div class="row due"><span>Balance due</span><span>${money(due, cur)}</span></div>` : ""}
    </div></div>
    <div class="paybox">
      <div class="ph">${due > 0 ? `Pay ${money(due, cur)} to` : "Payment details"}</div>
      <div class="paygrid">
        <div class="cell"><div class="k">Bank</div><div class="v">${COMPANY.bank}</div></div>
        <div class="cell"><div class="k">Account name</div><div class="v">${COMPANY.acct}</div></div>
        <div class="cell"><div class="k">Account number</div><div class="v acct">${COMPANY.acctno}</div></div>
      </div>
      <div class="payref">Please use <b>${inv.number}</b> as your transfer reference so we can match your payment.</div>
    </div>
    <div class="foot">
      <div class="cols">
        <div><div class="lbl">From</div><div class="val">${COMPANY.name}<br>${COMPANY.email}<br>${COMPANY.site}</div></div>
      </div>
      ${inv.notes ? `<div class="notes">${escapeHtml(inv.notes)}</div>` : ""}
      <div class="thanks">Thank you for your business.</div>
    </div>`;
  return shell(inner, "Invoice", "#FC5647");
}

export function renderReceiptHTML(opts: {
  receipt_number: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  currency: string;
  amount: number;
  method: string;
  reference?: string;
  paid_at: string;
  invoice_total: number;
  total_paid: number;
}): string {
  const cur = opts.currency;
  const balance = Math.max(0, opts.invoice_total - opts.total_paid);
  const inner = `
    <div class="top">
      <div class="brandrow">
        <img class="logo" src="${APP()}/logo-mark.png" alt="MYJOBHACK"/>
        <div class="doctype">
          <span class="k" style="background:#16A34A">Receipt</span>
          <div class="num">${opts.receipt_number}</div>
        </div>
      </div>
      <div class="meta">
        <div><div class="lbl">Received from</div><div class="val">${escapeHtml(opts.client_name)}<br>${escapeHtml(opts.client_email)}</div></div>
        <div><div class="lbl">Date</div><div class="val">${fmtDate(opts.paid_at)}</div></div>
        <div><div class="lbl">For invoice</div><div class="val">${opts.invoice_number}</div></div>
      </div>
    </div>
    <div class="body">
      <table>
        <thead><tr><th>Payment received</th><th class="r">Method</th><th class="r">Amount</th></tr></thead>
        <tbody><tr>
          <td><div class="desc">Payment towards invoice ${opts.invoice_number}</div>${opts.reference ? `<div style="font-size:12px;color:#9A9CA6;margin-top:3px">Ref: ${escapeHtml(opts.reference)}</div>` : ""}</td>
          <td class="r" style="text-transform:capitalize">${escapeHtml(opts.method)}</td>
          <td class="r"><b>${money(opts.amount, cur)}</b></td>
        </tr></tbody>
      </table>
    </div>
    <div class="totals"><div class="box">
      <div class="row"><span>This payment</span><span>${money(opts.amount, cur)}</span></div>
      <div class="row"><span>Total paid to date</span><span>${money(opts.total_paid, cur)}</span></div>
      <div class="row grand"><span>${balance > 0 ? "Balance remaining" : "Fully settled"}</span><span>${money(balance, cur)}</span></div>
    </div></div>
    <div class="foot">
      <div class="cols">
        <div><div class="lbl">From</div><div class="val">${COMPANY.name}<br>${COMPANY.email}<br>${COMPANY.site}</div></div>
      </div>
      <div class="thanks">${balance > 0 ? "Thank you — balance noted above." : "Payment complete. Thank you!"}</div>
    </div>`;
  return shell(inner, "Receipt", "#16A34A");
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function fmtDate(d?: string | null) {
  if (!d) return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
