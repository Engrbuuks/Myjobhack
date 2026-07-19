import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Why isn't my job showing? Open /api/public/jobs/health and this will say.
 * It inspects every job and reports exactly what excludes it from the feed.
 */
export async function GET() {
  const admin = createAdminClient();
  const now = new Date();

  const { data: all, error } = await admin.from("jobs")
    .select("*").order("created_at", { ascending: false }).limit(50);

  if (error) {
    return NextResponse.json({
      ok: false,
      problem: "Cannot read the jobs table at all.",
      detail: error.message,
      likely_cause: error.message.includes("column")
        ? "A migration hasn't run yet. Run the pending SQL in Supabase, then: notify pgrst, 'reload schema';"
        : "Check the Supabase service role key in your environment variables."
    }, { status: 500 });
  }

  const jobs = all ?? [];
  const missingColumns: string[] = [];
  for (const col of ["salary_currency", "closes_at", "key_requirements", "is_featured", "featured_rank", "company_name", "company_logo_path"]) {
    if (jobs.length && !(col in jobs[0])) missingColumns.push(col);
  }

  const report = jobs.map((j: any) => {
    const reasons: string[] = [];
    if (j.status !== "published") reasons.push(`status is "${j.status}" — set it to Published`);
    if (j.closes_at && new Date(j.closes_at) < now) reasons.push(`deadline passed on ${new Date(j.closes_at).toLocaleString("en-GB")} — extend or clear it`);
    if (!j.published_at && j.status === "published") reasons.push("no published_at date — re-save the job");
    return {
      title: j.title,
      id: j.id,
      status: j.status,
      visible_in_feed: reasons.length === 0,
      featured: !!j.is_featured,
      blocked_by: reasons
    };
  });

  const visible = report.filter((r) => r.visible_in_feed);
  const featured = visible.filter((r) => r.featured);

  return NextResponse.json({
    ok: true,
    checked: now.toISOString(),
    summary: {
      total_jobs: jobs.length,
      visible_on_public_feed: visible.length,
      marked_featured: featured.length,
      hidden: report.length - visible.length
    },
    warnings: [
      ...(missingColumns.length
        ? [`These columns are missing — a migration hasn't run: ${missingColumns.join(", ")}. Run the pending SQL, then: notify pgrst, 'reload schema';`]
        : []),
      ...(featured.length === 0 && visible.length > 0
        ? ["No job is marked 'Feature on homepage'. If the WordPress homepage is set to featured-only, it will look empty. Either tick some jobs, or untick that option in Customizer §17."]
        : [])
    ],
    jobs: report
  });
}
