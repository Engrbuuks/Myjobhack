import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { CouponManager } from "@/components/CouponManager";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  const admin = createAdminClient();

  // Query independently so a missing table (pending migration) can't blank the page.
  const couponRes = await admin.from("coupons").select("*").order("created_at", { ascending: false });
  const tableMissing = !!couponRes.error;
  const coupons = couponRes.data ?? [];
  const { data: trainings } = await admin.from("trainings")
    .select("id, title, price_ngn").order("created_at", { ascending: false }).limit(100);

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
      {tableMissing && (
        <div className="card p-4 mb-6 border-coral/40" style={{ background: "#FFF4F2" }}>
          <div className="font-semibold text-sm text-ink">Coupons aren't set up in the database yet</div>
          <p className="text-sm text-muted-2 mt-1">
            Run migration <b>0037_coupons.sql</b> in Supabase, then refresh this page. The form below won't save until you do.
          </p>
        </div>
      )}
      <CouponManager coupons={rows as any} trainings={(trainings ?? []) as any} />
    </>
  );
}
