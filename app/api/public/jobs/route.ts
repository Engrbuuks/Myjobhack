import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const revalidate = 300;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function GET() {
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("jobs")
    .select("id, title, location, work_mode, role_level, employment_type, salary_note, published_at, org_id")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50);

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
      employment_type: j.employment_type, salary_note: j.salary_note,
      company: j.org_id ? orgNames.get(j.org_id) ?? "MYJOBHACK" : "MYJOBHACK",
      published_at: j.published_at,
      apply_url: `${appUrl}/portal/seeker/jobs/${j.id}`
    }))
  }, { headers: CORS });
}
