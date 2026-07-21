import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One diagnostic for the two current issues:
 *  - are employer plans in the DB (did migration 0025 finish)?
 *  - why isn't the newest job showing?
 * Open https://app.myjobhack.co/api/public/system-doctor
 */
export async function GET() {
  const admin = createAdminClient();
  const report: any = { checked_at: new Date().toISOString() };

  // 1 · Employer plans
  const ep = await admin.from("employer_plans").select("name, price_ngn, active").order("sort");
  report.employer_plans = ep.error
    ? { error: ep.error.message, verdict: "Table missing or unreadable — migration 0025 did not run." }
    : { count: ep.data?.length ?? 0, rows: ep.data, verdict: (ep.data?.length ?? 0) === 0 ? "Table exists but EMPTY — the seed didn't run. Re-run the seed." : "OK" };

  // 2 · Pricing settings row
  const pr = await admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle();
  report.pricing_settings = pr.data ? { present: true, value: pr.data.value } : { present: false, verdict: "Missing — migration 0026 didn't run." };

  // 3 · Newest jobs and WHY each is or isn't public
  const nowIso = new Date().toISOString();
  const { data: jobs } = await admin.from("jobs")
    .select("id, title, status, closes_at, created_at, is_featured")
    .order("created_at", { ascending: false }).limit(5);

  report.recent_jobs = (jobs ?? []).map((j) => {
    const expired = j.closes_at ? new Date(j.closes_at) < new Date(nowIso) : false;
    const published = j.status === "published";
    const isPublic = published && !expired;
    return {
      title: j.title, status: j.status, created: j.created_at,
      closes_at: j.closes_at,
      blocked_by: isPublic ? null : (!published ? `status is "${j.status}", not "published"` : expired ? `deadline ${j.closes_at} is in the past` : "unknown"),
      PUBLIC: isPublic
    };
  });

  const newest = report.recent_jobs[0];
  report.newest_job_verdict = !newest ? "No jobs at all."
    : newest.PUBLIC ? "Newest job IS public — if it's not on the site, the app is serving a stale build/cache."
    : `Newest job is hidden: ${newest.blocked_by}.`;

  // 4 · What the PUBLIC FEED actually returns right now (this is what WordPress reads)
  const nowIso2 = new Date().toISOString();
  const feed = await admin.from("jobs")
    .select("title, status, closes_at")
    .eq("status", "published")
    .or(`closes_at.is.null,closes_at.gt.${nowIso2}`)
    .order("published_at", { ascending: false }).limit(80);
  report.public_feed_returns = {
    count: feed.data?.length ?? 0,
    titles: (feed.data ?? []).map((j: any) => j.title),
    verdict: (feed.data?.length ?? 0) === 0
      ? "Feed is EMPTY — nothing will show on any surface. Check status/deadline."
      : "Feed returns jobs — if a surface is blank, that surface is caching or not wired to the feed."
  };

  // 5 · which project is this
  report.project_ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https?:\/\//, "").split(".")[0];

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
