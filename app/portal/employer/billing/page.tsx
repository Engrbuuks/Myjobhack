import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { EmployerInvoices } from "@/components/EmployerInvoices";

export const dynamic = "force-dynamic";

export default async function EmployerBillingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  // Invoices raised for this employer (placement + assessment fees), plus their placements/orders.
  const { data: invoices } = await admin.from("invoices")
    .select("id, number, total, currency, status, items, created_at")
    .eq("created_by", user!.id).order("created_at", { ascending: false });

  // Map invoice → placement / order so we can pay the right purpose.
  const { data: placements } = await admin.from("placements").select("id, invoice_id, fee_amount, is_elite").eq("employer_id", user!.id);
  const { data: orders } = await admin.from("assessment_orders").select("id, invoice_id, amount").eq("employer_id", user!.id);

  const rows = (invoices ?? []).map((inv) => {
    const pl = (placements ?? []).find((p: any) => p.invoice_id === inv.id);
    const ord = (orders ?? []).find((o: any) => o.invoice_id === inv.id);
    return {
      id: inv.id, number: inv.number, total: Number(inv.total), status: inv.status,
      created_at: inv.created_at,
      purpose: pl ? "placement_fee" : ord ? "job_assessment" : "invoice",
      ref: pl ? { placement_id: pl.id } : ord ? { order_id: ord.id } : {}
    };
  });

  return (
    <>
      <PageHeader title="Billing" sub="Your invoices for placements and assessments. Pay securely online with Paystack." />
      <EmployerInvoices rows={rows as any} />
    </>
  );
}
