import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPricing } from "@/lib/pricing";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id, status } = await request.json();
  const ALLOWED = ["submitted", "shortlisted", "interviewing", "offered", "hired", "rejected"];
  if (!id || !ALLOWED.includes(status))
    return NextResponse.json({ error: "id and valid status required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: app } = await admin.from("applications").select("id, job_id, talent_id").eq("id", id).single();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: job } = await admin.from("jobs").select("org_id").eq("id", app.job_id).single();
  if (!job) return NextResponse.json({ error: "That job no longer exists." }, { status: 404 });

  /**
   * Two kinds of job reach this route, and only one was allowed through.
   *
   * A job posted by MYJOBHACK has org_id NULL, by design. The old check
   * rejected exactly those with "Not an employer job", so on any job you
   * posted yourself every status change failed with a 403 that the interface
   * swallowed. Staff are authorised by role; employers by membership of the
   * organisation that owns the job.
   */
  const { data: me } = await admin.from("profiles")
    .select("role, permissions").eq("id", user.id).maybeSingle();
  const isStaff = ["admin", "recruiter"].includes(me?.role ?? "");

  if (!isStaff) {
    if (!job.org_id)
      return NextResponse.json({ error: "This job belongs to MYJOBHACK, so only staff can change its applicants." }, { status: 403 });
    const { data: membership } = await admin.from("org_members")
      .select("org_id").eq("org_id", job.org_id).eq("profile_id", user.id).maybeSingle();
    if (!membership)
      return NextResponse.json({ error: "This job belongs to another organisation." }, { status: 403 });
  } else if (!can(me, "applicants.manage")) {
    return NextResponse.json({
      error: "You do not have permission to move applicants between stages. Ask an administrator for applicant management access."
    }, { status: 403 });
  }

  const { error: upErr } = await admin.from("applications")
    .update({ status: status as any, reviewed_by: user.id }).eq("id", id);
  // A silently ignored failure here is what made this look like nothing
  // happened at all.
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // On HIRE, record a placement + compute the fee (once per application).
  if (status === "hired" && app.talent_id) {
    const { data: existing } = await admin.from("placements")
      .select("id").eq("job_id", app.job_id).eq("talent_id", app.talent_id).maybeSingle();
    if (!existing) {
      const pricing = await getPricing();
      // Is this candidate an Elite member?
      const { data: elite } = await admin.from("elite_memberships")
        .select("id, status").eq("talent_id", app.talent_id).maybeSingle();
      const isElite = !!elite && elite.status === "verified";

      let fee_type = "flat";
      let fee_amount = pricing.placement_general_ngn;
      let salary_monthly: number | null = null;

      if (isElite) {
        fee_type = "percent";
        // Try to read an expected salary to apply the %; fall back to flat if unknown.
        const { data: tp } = await admin.from("talent_profiles")
          .select("salary_min, salary_max").eq("profile_id", app.talent_id).maybeSingle();
        salary_monthly = Number(tp?.salary_max ?? tp?.salary_min ?? 0) || null;
        fee_amount = salary_monthly
          ? Math.round(salary_monthly * (pricing.placement_elite_percent / 100))
          : pricing.placement_general_ngn; // no salary on file → flat fallback
      }

      const { error: plErr } = await admin.from("placements").insert({
        job_id: app.job_id, employer_id: user.id, talent_id: app.talent_id,
        is_elite: isElite, salary_monthly, fee_type, fee_amount, status: "pending"
      });
      /**
       * The hire itself has already been recorded, so a placement failure must
       * not undo it. Report it instead: the status is correct, the fee record
       * needs attention.
       */
      if (plErr) return NextResponse.json({
        ok: true, status_changed: true, placement_error: plErr.message,
        message: `Moved to hired, but the placement fee record could not be created: ${plErr.message}`
      });
    }
  }

  return NextResponse.json({ ok: true, status });
}
