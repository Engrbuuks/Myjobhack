import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "../_auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * The answer guarantee, enforced once a day.
 *
 * Two passes, both cheap because the index is partial:
 *
 *   1 · a nudge, on the day an answer is due, to whoever can give it
 *   2 · a breach, once the deadline has passed, recorded on the application
 *       and reported to staff
 *
 * A BREACH IS RECORDED, NOT HIDDEN. The point of promising an answer is that
 * somebody can be shown not to have given one. If this ran quietly and
 * marked nothing, the guarantee would be a sentence on a marketing page
 * again, which is the thing this whole build exists to stop.
 *
 * Nothing is sent to the candidate. Being told that an employer is late is
 * worse than silence until there is something to say, and the member sees
 * the clock on their own application anyway.
 */
export async function GET(request: Request) {
  const refused = requireCronAuth(request);
  if (refused) return refused;

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + 24 * 3_600_000).toISOString();

  /* ---------------- 1 · due within a day, not yet answered -------------- */
  const { data: dueSoon } = await admin.from("applications")
    .select("id, job_id, answer_due_at, talent_id")
    .not("answer_due_at", "is", null)
    .is("answered_at", null)
    .is("sla_breached_at", null)
    .gt("answer_due_at", nowIso)
    .lte("answer_due_at", soonIso)
    .limit(200);

  const nudged = new Map<string, number>();
  for (const a of dueSoon ?? []) nudged.set(a.job_id, (nudged.get(a.job_id) ?? 0) + 1);

  for (const [jobId, count] of Array.from(nudged.entries())) {
    const { data: job } = await admin.from("jobs")
      .select("id, title, org_id, posted_by").eq("id", jobId).maybeSingle();
    if (!job) continue;

    /**
     * Who gets told: the person who posted the role, and the organisation's
     * members when it belongs to one. A MYJOBHACK posting has no
     * organisation, so it falls to whoever posted it.
     */
    const recipients = new Set<string>();
    if (job.posted_by) recipients.add(job.posted_by);
    if (job.org_id) {
      const { data: members } = await admin.from("org_members")
        .select("profile_id").eq("org_id", job.org_id).limit(20);
      for (const m of members ?? []) recipients.add(m.profile_id);
    }

    for (const who of Array.from(recipients)) {
      await admin.from("notifications").insert({
        profile_id: who,
        title: "An answer is due tomorrow",
        body: `${count} Elite ${count === 1 ? "applicant" : "applicants"} on ${job.title} ${count === 1 ? "is" : "are"} inside the answer guarantee, and the deadline is tomorrow. Any decision counts, including a no.`,
        link: `/portal/employer/jobs/${jobId}/applicants`
      });
    }
  }

  /* ---------------- 2 · already past the deadline ----------------------- */
  const { data: late } = await admin.from("applications")
    .select("id, job_id, answer_due_at")
    .not("answer_due_at", "is", null)
    .is("answered_at", null)
    .is("sla_breached_at", null)
    .lte("answer_due_at", nowIso)
    .limit(500);

  const breached = (late ?? []).map((a: any) => a.id);
  if (breached.length) {
    await admin.from("applications")
      .update({ sla_breached_at: nowIso })
      .in("id", breached);
  }

  // One line to staff, not one per application.
  if (breached.length) {
    const byJob = new Map<string, number>();
    for (const a of late ?? []) byJob.set(a.job_id, (byJob.get(a.job_id) ?? 0) + 1);

    const { data: staff } = await admin.from("profiles")
      .select("id").in("role", ["admin"]).limit(10);

    const worst = Array.from(byJob.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const titles: string[] = [];
    for (const [jobId, count] of worst) {
      const { data: job } = await admin.from("jobs").select("title").eq("id", jobId).maybeSingle();
      titles.push(`${job?.title ?? "a role"} (${count})`);
    }

    for (const s of staff ?? []) {
      await admin.from("notifications").insert({
        profile_id: s.id,
        title: `${breached.length} Elite ${breached.length === 1 ? "application" : "applications"} missed the answer guarantee`,
        body: `Worst affected: ${titles.join(", ")}. The members were not told, so there is still time to get an answer out of the employer before anyone notices.`,
        link: "/portal/admin/jobs"
      });
    }
  }

  await admin.from("activity_log").insert({
    actor_id: null, action: "answer sla run", entity: "cron", entity_id: null,
    meta: { nudged: dueSoon?.length ?? 0, breached: breached.length, at: nowIso }
  });

  return NextResponse.json({
    ok: true,
    nudged: dueSoon?.length ?? 0,
    breached: breached.length,
    message: `${dueSoon?.length ?? 0} due within a day, ${breached.length} past the deadline.`
  });
}
