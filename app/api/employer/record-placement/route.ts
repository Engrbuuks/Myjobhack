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

  /**
   * A placement raises an invoice, so the hire behind it has to be real.
   *
   * talent_id, job_id and monthly_salary all arrived from the body with
   * nothing checked, which meant any account holding the employer role could
   * invoice a placement fee against a candidate it had never hired, on a job
   * belonging to someone else. The hire is proved by the application record,
   * and the right to act on it by owning the job that application is for.
   *
   * job_id is optional because the applicant desk records a placement from
   * the candidate's row. When it is absent the hire itself names the job.
   */
  let hiresQuery = admin.from("applications")
    .select("id, job_id").eq("talent_id", talent_id).eq("status", "hired");
  if (job_id) hiresQuery = hiresQuery.eq("job_id", job_id);
  const { data: hires } = await hiresQuery;

  if (!hires?.length)
    return NextResponse.json({
      error: "This candidate has no application marked hired, so there is no placement to record. Move them to hired first."
    }, { status: 400 });

  const hiredJobIds = Array.from(new Set(hires.map((h: any) => h.job_id).filter(Boolean)));
  const { data: hiredJobs } = await admin.from("jobs")
    .select("id, title, org_id").in("id", hiredJobIds);

  const isStaff = ["admin", "recruiter"].includes(me?.role ?? "");
  let placedJob: { id: string; title: string | null; org_id: string | null } | null = null;

  if (isStaff) {
    placedJob = (hiredJobs?.[0] as any) ?? null;
  } else {
    const { data: mems } = await admin.from("org_members").select("org_id").eq("profile_id", user.id);
    const mine = new Set((mems ?? []).map((m: any) => m.org_id));
    placedJob = ((hiredJobs ?? []).find((j: any) => j.org_id && mine.has(j.org_id)) as any) ?? null;
  }

  if (!placedJob)
    return NextResponse.json({
      error: "That hire is on a job belonging to another organisation, so the placement is not yours to record."
    }, { status: 403 });

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
  const job = { title: placedJob.title };

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

  /**
   * One placement per hire, not two.
   *
   * Moving an applicant to hired already creates a pending placement in
   * employer/application-status. That insert used to fail on two wrong column
   * names, so this route always had a clean table to insert into and the
   * duplication never showed. With the column names fixed, a blind insert here
   * would bill the same hire twice. So the pending row is completed in place
   * when it exists, and only created when it does not.
   */
  const { data: pending } = await admin.from("placements")
    .select("id, status, invoice_id")
    .eq("job_id", placedJob.id).eq("talent_id", talent_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const row = {
    employer_id: user.id, talent_id, job_id: placedJob.id,
    is_elite: isElite, monthly_salary: monthly_salary ?? null,
    fee_amount: feeAmount, fee_basis: feeBasis, fee_basis_detail: feeNote, currency: "NGN",
    status: "invoiced", invoice_id: inv?.id ?? null
  };

  if (pending?.invoice_id && pending.status === "invoiced") {
    return NextResponse.json({
      error: "This placement has already been invoiced. Open the invoice rather than raising a second one."
    }, { status: 409 });
  }

  const { data: placement, error } = pending
    ? await admin.from("placements").update(row).eq("id", pending.id).select("id").single()
    : await admin.from("placements").insert(row).select("id").single();
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
