import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One endpoint that answers "why isn't my job showing?" definitively.
 * Open https://app.myjobhack.co/api/public/jobs-doctor in a browser.
 * It reports every job and the exact reason each is or isn't public.
 */
export async function GET() {
  const admin = createAdminClient();
  const now = new Date();
  const report: any = { checked_at: now.toISOString(), schema: {}, jobs: [], summary: {} };

  // ---- which columns actually exist ----
  const probes: Record<string, string> = {
    status: "status", published_at: "published_at", closes_at: "closes_at",
    salary_currency: "salary_currency", key_requirements: "key_requirements",
    is_featured: "is_featured", featured_rank: "featured_rank",
    company_name: "company_name", company_logo_path: "company_logo_path"
  };
  for (const [name, col] of Object.entries(probes)) {
    const { error } = await admin.from("jobs").select(col).limit(1);
    report.schema[name] = error ? `MISSING — ${error.message}` : "ok";
  }

  const missing = Object.entries(report.schema).filter(([, v]) => String(v).startsWith("MISSING"));
  if (missing.length) {
    report.summary.migrations_pending = missing.map(([k]) => k);
    report.summary.fix = "Run the pending SQL migrations in Supabase, then: notify pgrst, 'reload schema';";
  }

  // ---- every job, with a verdict ----
  const { data: all, error } = await admin.from("jobs")
    .select("*").order("created_at", { ascending: false }).limit(40);

  if (error) {
    report.summary.fatal = error.message;
    return NextResponse.json(report, { status: 500 });
  }

  let visible = 0;
  for (const j of all ?? []) {
    const reasons: string[] = [];
    if (j.status !== "published") reasons.push(`status is "${j.status}" — must be "published"`);
    if (j.closes_at && new Date(j.closes_at) <= now)
      reasons.push(`deadline passed (${new Date(j.closes_at).toISOString()}) — extend or clear it`);
    if (!j.title) reasons.push("no title");

    const ok = reasons.length === 0;
    if (ok) visible++;
    report.jobs.push({
      title: j.title, id: j.id,
      status: j.status,
      created: j.created_at,
      published_at: j.published_at ?? null,
      closes_at: j.closes_at ?? null,
      featured: j.is_featured ?? false,
      PUBLIC: ok ? "YES — appears in the feed" : "NO",
      blocked_by: ok ? undefined : reasons
    });
  }

  report.summary.total_jobs = (all ?? []).length;
  report.summary.public_jobs = visible;
  report.summary.hidden_jobs = (all ?? []).length - visible;

  if (visible === 0 && (all ?? []).length > 0) {
    report.summary.verdict = "Jobs exist but none are public. See blocked_by on each job above.";
  } else if (visible > 0) {
    report.summary.verdict =
      `${visible} job(s) are public and in the feed. If the website still shows fewer, the cache is stale — ` +
      `use the "↻ Refresh live jobs" button in the WordPress admin bar, or wait 3 minutes.`;
  } else {
    report.summary.verdict = "No jobs found at all in the database.";
  }

  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }
  });
}
