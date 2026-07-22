import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PaymentQueue } from "@/components/PaymentQueue";
import { PaymentsDashboard } from "@/components/PaymentsDashboard";

export const dynamic = "force-dynamic";

const PURPOSE_LABEL: Record<string, string> = {
  seeker_subscription: "Member subscriptions",
  employer_subscription: "Employer plans",
  training: "Trainings",
  profile_unlock: "Profile unlocks",
  placement_fee: "Placement fees",
  assessment_order: "Assessments",
  job_assessment: "Job-specific assessments",
  elite_premium: "Elite premium"
};

export default async function AdminPayments() {
  const supabase = createClient();
  const admin = createAdminClient();

  // ---- Manual-transfer review queue (unchanged behaviour) ----
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

  // ---- Revenue picture ----
  const { data: all } = await admin.from("payments")
    .select("id, amount, currency, method, status, purpose, provider_ref, created_at, profile_id")
    .order("created_at", { ascending: false }).limit(400);

  const confirmed = (all ?? []).filter((p) => p.status === "confirmed");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAgo = new Date(now.getTime() - 7 * 864e5);

  const sum = (arr: any[]) => arr.reduce((t, p) => t + Number(p.amount || 0), 0);
  const totals = {
    all_time: sum(confirmed),
    this_month: sum(confirmed.filter((p) => new Date(p.created_at) >= monthStart)),
    last_7: sum(confirmed.filter((p) => new Date(p.created_at) >= weekAgo)),
    count: confirmed.length,
    pending_review: (pending ?? []).length,
    initiated: (all ?? []).filter((p) => p.status === "initiated").length
  };

  // Breakdown by revenue stream
  const byPurpose = new Map<string, { label: string; total: number; count: number }>();
  for (const p of confirmed) {
    const key = p.purpose ?? "other";
    const cur = byPurpose.get(key) ?? { label: PURPOSE_LABEL[key] ?? "Other / manual", total: 0, count: 0 };
    cur.total += Number(p.amount || 0); cur.count += 1;
    byPurpose.set(key, cur);
  }
  const streams = Array.from(byPurpose.values()).sort((a, b) => b.total - a.total);

  // Recent transactions with names
  const recent = await Promise.all((all ?? []).slice(0, 25).map(async (p) => {
    const { data: prof } = await admin.from("profiles").select("full_name, email").eq("id", p.profile_id).maybeSingle();
    return {
      id: p.id, amount: Number(p.amount || 0), currency: p.currency, method: p.method,
      status: p.status, purpose: PURPOSE_LABEL[p.purpose ?? ""] ?? (p.purpose ?? "—"),
      ref: p.provider_ref ?? "—", created_at: p.created_at,
      who: prof?.full_name ?? prof?.email ?? "—"
    };
  }));

  return (
    <>
      <PageHeader title="Payments"
        sub="Every naira through the platform — live Paystack revenue, what's earning, and any manual transfers waiting on review." />
      <PaymentsDashboard totals={totals} streams={streams} recent={recent} />

      {rows.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display font-semibold text-lg mb-3">Manual transfers awaiting review ({rows.length})</h3>
          <PaymentQueue rows={rows as any} />
        </div>
      )}
    </>
  );
}
