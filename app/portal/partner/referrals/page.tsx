import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PartnerReferrals } from "@/components/PartnerReferrals";

export const dynamic = "force-dynamic";

export default async function PartnerReferralsPage() {
  const supabase = createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: links } = await admin.from("invite_links")
    .select("id, code, label, kind, signups, active, created_at")
    .eq("partner_id", user!.id).order("created_at", { ascending: false });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.myjobhack.co";
  const total = (links ?? []).reduce((t, l) => t + (l.signups ?? 0), 0);

  return (
    <>
      <PageHeader title="Referrals"
        sub={`Your referral links and how they're performing — ${total} signup${total === 1 ? "" : "s"} so far.`} />
      <PartnerReferrals links={(links ?? []) as any} base={base} />
    </>
  );
}
