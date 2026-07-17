import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { PaymentQueue } from "@/components/PaymentQueue";

export default async function AdminPayments() {
  const supabase = createClient();
  const { data: pending } = await supabase
    .from("payments")
    .select("id, amount, currency, method, provider_ref, proof_document_id, created_at, profile_id")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  const rows = await Promise.all(
    (pending ?? []).map(async (p) => {
      const { data: prof } = await supabase
        .from("profiles").select("full_name, email").eq("id", p.profile_id).single();
      let proofUrl: string | null = null;
      if (p.proof_document_id) {
        const { data: doc } = await supabase
          .from("documents").select("bucket, path").eq("id", p.proof_document_id).single();
        if (doc) {
          const { data: s } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.path, 3600);
          proofUrl = s?.signedUrl ?? null;
        }
      }
      return { ...p, name: prof?.full_name ?? "—", email: prof?.email ?? "", proofUrl };
    })
  );

  return (
    <>
      <PageHeader
        title="Payment confirmations"
        sub="Manual transfers land here. Confirm activates the subscription instantly and notifies the member."
      />
      <PaymentQueue rows={rows} />
    </>
  );
}
