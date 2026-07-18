import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

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
    const res = await sendEmail(inv.client_email, `Invoice ${inv.number} — MYJOBHACK`, renderEmail({
      preheader: `${sym}${Number(inv.total).toLocaleString()} due — ${inv.number}`,
      kicker: `Invoice ${inv.number}`,
      heading: `For ${inv.client_name}`,
      paragraphs: [
        "Thank you for working with MYJOBHACK. Your invoice details:",
        ...(inv.notes ? [inv.notes] : [])
      ],
      details,
      cta: { label: "Questions? Reply to this email", url: "mailto:hello@myjobhack.co" },
      footNote: "Kindly use the invoice number as your transfer reference."
    }));
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
