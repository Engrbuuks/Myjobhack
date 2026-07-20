import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";
import { renderInvoiceHTML, renderReceiptHTML } from "@/lib/invoiceDoc";

export const runtime = "nodejs";

async function staffOnly() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return me?.role === "admin" || me?.role === "recruiter" ? user : null;
}

export async function POST(request: Request) {
  const user = await staffOnly();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const b = await request.json();
  const admin = createAdminClient();

  if (b.action === "create") {
    const items = (b.items ?? []).filter((i: any) => i.description && Number(i.amount) > 0);
    if (!b.client_name || !b.client_email || items.length === 0)
      return NextResponse.json({ error: "Client name, email, and at least one line item required." }, { status: 400 });
    const total = items.reduce((a: number, i: any) => a + Number(i.amount) * (Number(i.qty) || 1), 0);
    const number = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const { data, error } = await admin.from("invoices").insert({
      number, client_name: b.client_name, client_email: b.client_email,
      currency: b.currency ?? "NGN", items, total, notes: b.notes ?? "",
      status: "draft", created_by: user.id
    }).select("id, number").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id, number: data.number });
  }

  if (b.action === "send") {
    const { data: inv } = await admin.from("invoices").select("*").eq("id", b.id).single();
    if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const key = inv.currency === "USD" ? "bank_transfer_usd" : "bank_transfer_ngn";
    const { data: bankRow } = await admin.from("app_settings").select("value").eq("key", key).maybeSingle();
    const bank = bankRow?.value as any;
    const sym = inv.currency === "USD" ? "$" : "₦";
    const details: [string, string][] = (inv.items as any[]).map((i) => [
      `${i.description}${Number(i.qty) > 1 ? ` × ${i.qty}` : ""}`,
      `${sym}${(Number(i.amount) * (Number(i.qty) || 1)).toLocaleString()}`
    ]);
    details.push(["TOTAL DUE", `${sym}${Number(inv.total).toLocaleString()}`]);
    if (bank?.account_number) {
      details.push(["Pay to", `${bank.bank} · ${bank.account_name}`]);
      details.push(["Account", bank.account_number]);
    }
    const html = renderInvoiceHTML({
      number: inv.number, client_name: inv.client_name, client_email: inv.client_email,
      currency: inv.currency, items: inv.items as any, total: Number(inv.total),
      amount_paid: Number(inv.amount_paid ?? 0), status: "sent", notes: inv.notes ?? "",
      issued_date: inv.issued_date, due_date: inv.due_date
    });
    const res = await sendEmail(inv.client_email, `Invoice ${inv.number} — MYJOBHACK`, html);
    if (res.error) return NextResponse.json({ error: `Email failed: ${res.error}` }, { status: 500 });
    await admin.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", b.id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "mark_paid" || b.action === "void") {
    await admin.from("invoices").update({
      status: b.action === "void" ? "void" : "paid",
      paid_at: b.action === "mark_paid" ? new Date().toISOString() : null
    }).eq("id", b.id);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "record_payment") {
    const amount = Number(b.amount);
    if (!b.id || !(amount > 0))
      return NextResponse.json({ error: "A payment amount greater than zero is required." }, { status: 400 });
    const { error } = await admin.from("invoice_payments").insert({
      invoice_id: b.id, amount, method: b.method ?? "transfer",
      reference: b.reference ?? null, note: b.note ?? null, recorded_by: user.id
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // trigger recomputes status; read it back
    const { data: inv } = await admin.from("invoices")
      .select("amount_paid, total, status").eq("id", b.id).single();
    return NextResponse.json({ ok: true, amount_paid: inv?.amount_paid, status: inv?.status });
  }

  if (b.action === "generate_receipt") {
    // For a specific payment (b.payment_id) or the latest one on the invoice.
    const { data: inv } = await admin.from("invoices").select("*").eq("id", b.id).single();
    if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    let payment: any;
    if (b.payment_id) {
      const { data } = await admin.from("invoice_payments").select("*").eq("id", b.payment_id).single();
      payment = data;
    } else {
      const { data } = await admin.from("invoice_payments").select("*")
        .eq("invoice_id", b.id).order("paid_at", { ascending: false }).limit(1).maybeSingle();
      payment = data;
    }
    if (!payment) return NextResponse.json({ error: "No payment to receipt yet." }, { status: 400 });

    // assign a receipt number if not already set
    let receiptNo = payment.receipt_number;
    if (!receiptNo) {
      const { data: seq } = await admin.rpc("nextval_receipt");
      receiptNo = `RCP-${new Date().getFullYear()}-${seq ?? Date.now().toString().slice(-4)}`;
      await admin.from("invoice_payments").update({ receipt_number: receiptNo }).eq("id", payment.id);
    }

    const html = renderReceiptHTML({
      receipt_number: receiptNo, invoice_number: inv.number,
      client_name: inv.client_name, client_email: inv.client_email,
      currency: inv.currency, amount: Number(payment.amount), method: payment.method,
      reference: payment.reference, paid_at: payment.paid_at,
      invoice_total: Number(inv.total), total_paid: Number(inv.amount_paid ?? 0)
    });

    if (b.send) {
      const res = await sendEmail(inv.client_email, `Receipt ${receiptNo} — MYJOBHACK`, html);
      if (res.error) return NextResponse.json({ error: `Email failed: ${res.error}` }, { status: 500 });
      return NextResponse.json({ ok: true, receipt_number: receiptNo, emailed: true });
    }
    return NextResponse.json({ ok: true, receipt_number: receiptNo, html });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
