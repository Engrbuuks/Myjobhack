import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One endpoint that answers "why isn't my job showing?" definitively. STAFF ONLY.
 * Open https://app.myjobhack.co/api/admin/jobs-doctor while signed in as staff.
 * It reports every job and the exact reason each is or isn't public.
 *
 * WHY IT MOVED OFF /api/public: middleware treats the whole /api/public prefix
 * as public, so every job row in the database, drafts included, was readable by
 * anyone who knew the URL. It now sits behind settings.manage.
 *
 * READ ONLY, deliberately. This endpoint used to accept ?fix=1 and clear
 * closes_at on every expired published job with the service role, which meant
 * an unauthenticated stranger could reopen closed vacancies in bulk. The
 * branch is gone rather than gated: a repair that rewrites rows across the
 * table belongs in a deliberate admin action with a confirmation and an audit
 * trail, not in a diagnostic that people open in a browser to look around.
 */
export async function GET() {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  const now = new Date();
  // Which database is this app actually talking to? Only the project ref is
  // exposed — never the keys.
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const projectRef = rawUrl.replace(/^https?:\/\//, "").split(".")[0] || "NOT SET";
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  const report: any = {
    checked_at: now.toISOString(),
    connection: {
      project_ref: projectRef,
      anon_key_present: hasAnon,
      service_key_present: hasService,
      compare_with: "The project ref in your Supabase dashboard URL. If these differ, the app is reading a different database than the one you edit."
    },
    schema: {}, jobs: [], summary: {}
  };

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
    console.error("[jobs-doctor] cannot read the jobs table:", error.message);
    report.summary.fatal = "Cannot read the jobs table. The reason is in the server logs.";
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

  // The wildcard CORS header this used to send is gone with the public URL:
  // the report is read by a signed in person in a browser tab, not fetched
  // cross origin by the WordPress site.
  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" }
  });
}
