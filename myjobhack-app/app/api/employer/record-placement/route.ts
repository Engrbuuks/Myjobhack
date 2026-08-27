import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/pricing";

export const runtime = "nodejs";

/**
 * Record a placement when an employer hires through the platform.
 * Fee: flat for general talent, % of monthly salary for Elite talent.
 * Raises a draft invoice for the fee.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!["admin", "recruiter", "employer"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { talent_id, job_id, monthly_salary } = await request.json();
  if (!talent_id) return NextResponse.json({ error: "talent_id required" }, { status: 400 });

  // Is this candidate Elite?
  const { data: elite } = await admin.from("elite_memberships")
    .select("id, status").eq("talent_id", talent_id).eq("status", "verified").maybeSingle();
  const isElite = !!elite;

  const pricing = await getPricing();

  let feeAmount = 0; let feeBasis = "flat"; let feeNote = "";
  if (isElite) {
    const salary = Number(monthly_salary) || 0;
    if (salary <= 0)
      return NextResponse.json({ error: "Elite placement needs the monthly salary to compute the fee." }, { status: 400 });

    // Fee basis is configurable in the Pricing Center:
    //   'annual'   → percentage of annual salary (monthly × 12)  [industry standard]
    //   'monthly'  → percentage of a single month's salary
    //   'multiple' → a straight multiple of monthly salary (e.g. 1.5 months)
    const basis = pricing.placement_basis || "annual";
    const pct = Number(pricing.placement_elite_percent) || 0;

    if (basis === "multiple") {
      const mult = Number(pricing.placement_multiple) || 1;
      feeBasis = "multiple";
      feeAmount = Math.round(salary * mult);
      feeNote = `Elite placement — ${mult} month${mult === 1 ? "" : "s"} of salary.`;
    } else if (basis === "monthly") {
      feeBasis = "percent_monthly";
      feeAmount = Math.round(salary * (pct / 100));
      feeNote = `Elite placement — ${pct}% of monthly salary.`;
    } else {
      feeBasis = "percent_annual";
      feeAmount = Math.round(salary * 12 * (pct / 100));
      feeNote = `Elite placement — ${pct}% of annual salary (₦${(salary * 12).toLocaleString()}).`;
    }
  } else {
    feeBasis = "flat";
    feeAmount = pricing.placement_general_ngn;
    feeNote = "Standard placement fee.";
  }

  // candidate + job labels
  const { data: cand } = await admin.from("profiles").select("full_name, email").eq("id", talent_id).maybeSingle();
  const { data: job } = job_id ? await admin.from("jobs").select("title").eq("id", job_id).maybeSingle() : { data: null };

  // Raise a draft invoice for the fee.
  const invNumber = `PLC-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
  const { data: inv } = await admin.from("invoices").insert({
    number: invNumber,
    client_name: me?.full_name ?? "Employer",
    client_email: (await admin.from("profiles").select("email").eq("id", user.id).single()).data?.email ?? "",
    currency: "NGN",
    items: [{
      description: `Placement fee — ${cand?.full_name ?? "candidate"}${isElite ? " (Elite)" : ""}${job?.title ? ` · ${job.title}` : ""}`,
      qty: 1, amount: feeAmount
    }],
    total: feeAmount, status: "draft",
    notes: feeNote,
    created_by: user.id
  }).select("id, number").single();

  // Record the placement, linked to the invoice.
  const { data: placement, error } = await admin.from("placements").insert({
    employer_id: user.id, talent_id, job_id: job_id ?? null,
    is_elite: isElite, monthly_salary: monthly_salary ?? null,
    fee_amount: feeAmount, fee_basis: feeBasis, fee_basis_detail: feeNote, currency: "NGN",
    status: "invoiced", invoice_id: inv?.id ?? null
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    is_elite: isElite,
    fee_amount: feeAmount,
    fee_basis: feeBasis,
    invoice_number: inv?.number,
    message: `Placement recorded. Fee: ₦${feeAmount.toLocaleString()} — ${feeNote} Invoice ${inv?.number} raised.`
  });
}
