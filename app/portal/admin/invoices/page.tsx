import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { InvoiceDesk } from "@/components/InvoiceDesk";

export default async function InvoicesPage() {
  const supabase = createClient();
  const { data: invoices } = await supabase.from("invoices")
    .select("id, number, client_name, client_email, currency, total, status, created_at")
    .order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Invoices"
        sub="Bill employer requests and services — create, send as a branded email with your bank details, mark paid." />
      <InvoiceDesk invoices={(invoices ?? []) as any} />
    </>
  );
}
