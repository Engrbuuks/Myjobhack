import { NextResponse } from "next/server";
import { rematchDirtySeekers, notifyNewMatches } from "@/lib/proactiveMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily proactive matching.
 *
 * Two cheap passes rather than one expensive one:
 *   1. Re-match seekers whose profile or competency band actually changed.
 *   2. Notify anyone with a strong match they have not been told about.
 *
 * Jobs are matched at the moment they are published (see /api/jobs/publish-match),
 * so this pass only handles what changed on the candidate side.
 */
export async function GET(request: Request) {
  // Vercel cron sends this header; block anything else.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
  }

  try {
    // Cost is capped: at most 25 AI calls per run, regardless of pool size.
    const rematched = await rematchDirtySeekers(200, 25, 20);
    const notified = await notifyNewMatches();

    // Log the run so AI spend is visible rather than assumed.
    const admin = (await import("@/lib/supabase/admin")).createAdminClient();
    await admin.from("activity_log").insert({
      action: `Matching run: ${rematched.ai_calls} AI calls, ${rematched.rematched} seekers refreshed, ${notified.notified} notified`,
      entity: "cron", entity_id: null
    });

    return NextResponse.json({
      ok: true,
      seekers_refreshed: rematched.rematched,
      ai_calls: rematched.ai_calls,
      jobs_skipped_still_fresh: rematched.skipped_fresh,
      notified: notified.notified,
      skipped_rate_limited: notified.skipped,
      ran_at: new Date().toISOString()
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Matching run failed." }, { status: 500 });
  }
}
