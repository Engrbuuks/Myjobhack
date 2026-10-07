import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * What the interviews table ACTUALLY holds, right now.
 *
 * WHY THIS EXISTS: "the invitations are not showing" and "deleted interviews
 * come back" are both consistent with two completely different causes — rows
 * that were never written, or a page serving a cached copy. Guessing between
 * them wastes a day. This endpoint answers it in one request: it reads with
 * the service role, so row level security cannot hide anything, and it sets no
 * cache headers, so what comes back is the live table.
 *
 * Open it in a browser while signed in as staff:
 *   /api/admin/interview-doctor
 *   /api/admin/interview-doctor?job=<job id>
 *   /api/admin/interview-doctor?email=someone@example.com
 *
 * If a row appears here but not on the Interviews page, the page is stale and
 * reloading fixes it. If it does not appear here, it was never saved, and the
 * reason will be in the scheduling response rather than in the display.
 */
export async function GET(request: Request) {
  const gate = await requirePermission("applicants.view");
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const job = searchParams.get("job");
  const email = searchParams.get("email");

  const now = new Date();

  // Totals straight from the database, counted server side rather than by
  // length of a fetched page, so a 1000 row default limit cannot mislead.
  const countFor = async (status?: string) => {
    let q = admin.from("interviews").select("id", { count: "exact", head: true });
    if (status) q = q.eq("status", status);
    if (job) q = q.eq("job_id", job);
    const { count } = await q;
    return count ?? 0;
  };

  const [total, invited, scheduled, completed, noShow, cancelled] = await Promise.all([
    countFor(), countFor("invited"), countFor("scheduled"),
    countFor("completed"), countFor("no_show"), countFor("cancelled")
  ]);

  // The most recently created rows, which is what you want right after a bulk
  // run: if the twenty you just invited are here, they were saved.
  let recentQ = admin.from("interviews")
    .select("id, status, scheduled_at, created_at, batch_id, job_id, application_id, talent_id, guest_name, guest_email, timezone")
    .order("created_at", { ascending: false })
    .limit(30);
  if (job) recentQ = recentQ.eq("job_id", job);
  if (email) recentQ = recentQ.ilike("guest_email", email);
  const { data: recent, error: recentErr } = await recentQ;

  // Batches, so a bulk run can be matched to the rows it created. A batch with
  // invited_count 20 and no interviews is a save that failed after the batch
  // row was written.
  const { data: batches } = await admin.from("interview_batches")
    .select("id, job_id, invited_count, created_at, timezone")
    .order("created_at", { ascending: false }).limit(5);

  const batchRows: Record<string, number> = {};
  for (const b of batches ?? []) {
    const { count } = await admin.from("interviews")
      .select("id", { count: "exact", head: true }).eq("batch_id", b.id);
    batchRows[b.id] = count ?? 0;
  }

  const jobIds = Array.from(new Set((recent ?? []).map((r: any) => r.job_id).filter(Boolean)));
  const { data: jobs } = jobIds.length
    ? await admin.from("jobs").select("id, title").in("id", jobIds)
    : { data: [] as any[] };
  const jTitle = new Map((jobs ?? []).map((j: any) => [j.id, j.title]));

  return NextResponse.json({
    read_at: now.toISOString(),
    read_at_lagos: now.toLocaleString("en-GB", { timeZone: "Africa/Lagos" }),
    filtered_by: { job: job ?? null, email: email ?? null },
    counts: { total, invited, scheduled, completed, no_show: noShow, cancelled },
    error: recentErr?.message ?? null,
    recent_batches: (batches ?? []).map((b: any) => ({
      id: b.id,
      created_at: b.created_at,
      job: jTitle.get(b.job_id) ?? b.job_id,
      invited_count: b.invited_count,
      interview_rows_found: batchRows[b.id] ?? 0,
      verdict: (batchRows[b.id] ?? 0) === b.invited_count
        ? "all rows saved"
        : `MISMATCH: the batch says ${b.invited_count} but ${batchRows[b.id] ?? 0} interview rows exist`
    })),
    newest_interviews: (recent ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      status: r.status,
      when: r.scheduled_at
        ? new Date(r.scheduled_at).toLocaleString("en-GB", { timeZone: r.timezone || "Africa/Lagos" })
        : "no time set",
      job: jTitle.get(r.job_id) ?? r.job_id,
      candidate: r.guest_name ?? (r.talent_id ? `registered user ${r.talent_id}` : "unnamed"),
      email: r.guest_email ?? "",
      batch_id: r.batch_id ?? null,
      application_id: r.application_id ?? null
    })),
    how_to_read_this: [
      "Rows listed here are in the database. If they are missing from the Interviews page, the page served a cached copy — reload it.",
      "If a row you expect is absent here, it was never saved. The scheduling screen's own response says why.",
      "A batch whose verdict says MISMATCH means the invitations were emailed but the interview rows were rejected, usually by the double booking index."
    ]
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
