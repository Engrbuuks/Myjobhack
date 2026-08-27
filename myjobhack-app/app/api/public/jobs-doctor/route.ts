import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One endpoint that answers "why isn't my job showing?" definitively.
 * Open https://app.myjobhack.co/api/public/jobs-doctor in a browser.
 * It reports every job and the exact reason each is or isn't public.
 */
export async function GET(request: Request) {
  const admin = createAdminClient();
  const url = new URL(request.url);
  const fix = url.searchParams.get("fix") === "1";
  const now = new Date();
  // Which database is this app actually talking to? Only the project ref is
  // exposed — never the keys — so this is safe to read in a browser.
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
  // ?fix=1 — clear deadlines already in the past, using the service role.
  // This bypasses row-level security, so it also proves whether RLS was the blocker.
  if (fix) {
    const { data: expired } = await admin.from("jobs")
      .select("id, title, closes_at")
      .eq("status", "published")
      .not("closes_at", "is", null)
      .lt("closes_at", now.toISOString());

    const repairs: any[] = [];
    for (const e of expired ?? []) {
      const { data: after, error: upErr } = await admin.from("jobs")
        .update({ closes_at: null }).eq("id", e.id).select("id, closes_at");
      repairs.push({
        title: e.title,
        was: e.closes_at,
        rows_changed: after?.length ?? 0,
        now: after?.[0]?.closes_at ?? "unchanged",
        error: upErr?.message ?? null
      });
    }
    report.repair = repairs.length
      ? repairs
      : "No expired deadlines found to clear.";
    report.repair_note =
      "rows_changed of 0 with no error means the write was blocked or the row did not match. " +
      "rows_changed of 1 with now:null means it is fixed.";
  }

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
