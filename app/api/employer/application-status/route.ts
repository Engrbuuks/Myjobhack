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
  const { data: app } = await admin.from("applications")
    .select("id, job_id, talent_id, guest_name, guest_email").eq("id", id).single();
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

  /**
   * On HIRE, record a placement and compute the fee, once per application.
   *
   * The guard used to be `app.talent_id`, which skipped every guest. Guests
   * are most of the applicants on this system, so most hires raised no fee at
   * all. placements.talent_id is nullable from 0060 and carries the guest's
   * name and email instead, because the fee is owed whether or not the person
   * made an account.
   */
  if (status === "hired") {
    const guestEmail = app.talent_id ? null : (app.guest_email ?? null);
    if (!app.talent_id && !guestEmail) {
      return NextResponse.json({
        ok: true, status_changed: true, placement_error: "no_candidate_identity",
        message: "Moved to hired, but no fee record could be created because this application has neither a profile nor an email address."
      });
    }

    const found = app.talent_id
      ? await admin.from("placements").select("id")
          .eq("job_id", app.job_id).eq("talent_id", app.talent_id).maybeSingle()
      : await admin.from("placements").select("id")
          .eq("job_id", app.job_id).eq("guest_email", guestEmail!).maybeSingle();
    const existing = found.data;
    if (!existing) {
      const pricing = await getPricing();
      // Elite status lives on a profile, so a guest is never Elite and the
      // lookup is skipped rather than run with a null id, which matches
      // nothing and reads as an error in the logs.
      const { data: elite } = app.talent_id
        ? await admin.from("elite_memberships")
            .select("id, status").eq("talent_id", app.talent_id).maybeSingle()
        : { data: null as any };
      const isElite = !!elite && elite.status === "verified";

      /**
       * The column names here were wrong, and every automatic placement insert
       * had failed silently since launch.
       *
       * The code wrote salary_monthly and fee_type; the table has
       * monthly_salary and fee_basis (0028_placement_fees.sql). Neither of the
       * names used appeared in any migration, so Postgres rejected the insert,
       * the error went into placement_error, and the bulk path in
       * ApplicantTable discarded the response, which is why nobody saw it. No
       * placement meant no fee, no invoice, and no retention check ins either,
       * because schedule_checkins fires on a placement insert.
       *
       * The fee basis was also wrong: this path charged a percentage of ONE
       * month while the configured default is annual, roughly a twelvefold
       * undercharge. It now uses the same calculation as the manual route in
       * record-placement, which was correct all along.
       */
      let fee_basis = "flat";
      let fee_amount = pricing.placement_general_ngn;
      let monthly_salary: number | null = null;

      if (isElite && app.talent_id) {
        const { data: tp } = await admin.from("talent_profiles")
          .select("salary_min, salary_max").eq("profile_id", app.talent_id).maybeSingle();
        monthly_salary = Number(tp?.salary_max ?? tp?.salary_min ?? 0) || null;

        if (monthly_salary) {
          const basis = pricing.placement_basis || "annual";
          const pct = Number(pricing.placement_elite_percent) || 0;
          if (basis === "multiple") {
            const mult = Number(pricing.placement_multiple) || 1;
            fee_basis = "multiple";
            fee_amount = Math.round(monthly_salary * mult);
          } else if (basis === "monthly") {
            fee_basis = "percent_monthly";
            fee_amount = Math.round(monthly_salary * (pct / 100));
          } else {
            fee_basis = "percent_annual";
            fee_amount = Math.round(monthly_salary * 12 * (pct / 100));
          }
        }
        // No salary on file keeps the flat fee rather than charging zero.
      }

      const { error: plErr } = await admin.from("placements").insert({
        job_id: app.job_id, employer_id: user.id,
        talent_id: app.talent_id ?? null,
        guest_name: app.talent_id ? null : (app.guest_name ?? null),
        guest_email: app.talent_id ? null : guestEmail,
        is_elite: isElite, monthly_salary, fee_basis, fee_amount, status: "pending"
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
