import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { CouponManager } from "@/components/CouponManager";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  const admin = createAdminClient();
  const [{ data: coupons }, { data: trainings }] = await Promise.all([
    admin.from("coupons").select("*").order("created_at", { ascending: false }),
    admin.from("trainings").select("id, title, price_ngn").order("created_at", { ascending: false }).limit(100)
  ]);

  // What each code has actually earned and given away.
  const { data: reds } = await admin.from("coupon_redemptions")
    .select("coupon_id, discount_amount, final_amount");
  const stats = new Map<string, { given: number; collected: number; uses: number }>();
  (reds ?? []).forEach((r: any) => {
    const s = stats.get(r.coupon_id) ?? { given: 0, collected: 0, uses: 0 };
    s.given += Number(r.discount_amount || 0);
    s.collected += Number(r.final_amount || 0);
    s.uses += 1;
    stats.set(r.coupon_id, s);
  });

  const rows = (coupons ?? []).map((c: any) => ({
    ...c,
    training_title: c.training_id
      ? (trainings ?? []).find((t: any) => t.id === c.training_id)?.title ?? "Specific training"
      : null,
    stat: stats.get(c.id) ?? { given: 0, collected: 0, uses: 0 }
  }));

  return (
    <>
      <PageHeader title="Training coupons"
        sub="Discount codes for trainings — run a launch offer, reward a partner's audience, or fill a cohort that isn't selling." />
      <CouponManager coupons={rows as any} trainings={(trainings ?? []) as any} />
    </>
  );
}
