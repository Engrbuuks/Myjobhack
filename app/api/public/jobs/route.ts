import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { denominate } from "@/lib/currency";

export const runtime = "nodejs";
export const revalidate = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=0, must-revalidate"
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const onlyFeatured = params.get("featured") === "1";
  const limitParam = Math.min(Math.max(Number(params.get("limit") ?? 0) || 0, 0), 50);

  const admin = createAdminClient();
  let query = admin.from("jobs")
    .select("id, title, location, work_mode, role_level, employment_type, salary_note, salary_currency, published_at, closes_at, key_requirements, is_featured, featured_rank, org_id")
    .eq("status", "published")
    .or(`closes_at.is.null,closes_at.gt.${new Date().toISOString()}`);

  if (onlyFeatured) {
    query = query.eq("is_featured", true)
      .order("featured_rank", { ascending: true, nullsFirst: false })
      .order("published_at", { ascending: false });
  } else {
    query = query.order("published_at", { ascending: false });
  }

  const { data: jobs } = await query.limit(limitParam || 50);

  const orgIds = Array.from(new Set((jobs ?? []).map((j) => j.org_id).filter(Boolean))) as string[];
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await admin.from("organizations").select("id, name").in("id", orgIds);
    (orgs ?? []).forEach((o) => orgNames.set(o.id, o.name));
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

  return NextResponse.json({
    jobs: (jobs ?? []).map((j) => ({
      id: j.id, title: j.title, location: j.location,
      work_mode: j.work_mode, role_level: j.role_level,
      employment_type: j.employment_type,
      salary_note: denominate(j.salary_note, j.salary_currency || "NGN"),
      salary_currency: j.salary_currency || "NGN",
      closes_at: j.closes_at,
      key_requirements: j.key_requirements ?? [],
      is_featured: !!j.is_featured,
      featured_rank: j.featured_rank ?? null,
      company: j.org_id ? orgNames.get(j.org_id) ?? "MYJOBHACK" : "MYJOBHACK",
      published_at: j.published_at,
      apply_url: `${appUrl}/jobs/${j.id}`
    }))
  }, { headers: CORS });
}
