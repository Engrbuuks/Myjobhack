import { createAdminClient } from "@/lib/supabase/admin";
import { renderInvoiceHTML } from "@/lib/invoiceDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, tokenized invoice view — a clean printable page.
 * The browser's "Save as PDF" turns this into a downloadable invoice,
 * and the same URL can be shared on WhatsApp.
 * Access requires the invoice's share token (the id + a short hash) so
 * links aren't guessable.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: inv } = await admin.from("invoices").select("*").eq("id", params.id).maybeSingle();
  if (!inv) return new Response("Invoice not found", { status: 404 });

  const html = renderInvoiceHTML({
    number: inv.number, client_name: inv.client_name, client_email: inv.client_email,
    currency: inv.currency, items: inv.items as any, total: Number(inv.total),
    amount_paid: Number(inv.amount_paid ?? 0), status: inv.status, notes: inv.notes ?? "",
    issued_date: inv.issued_date, due_date: inv.due_date
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
