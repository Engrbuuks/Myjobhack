import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Short, shareable job links: /j/AB12CD  →  redirects to /jobs/<uuid>.
 * The code is the first 8 chars of the job UUID (dashes removed), which is
 * unique enough in practice and needs no extra column.
 */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const code = (params.code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!code || code.length < 6) {
    return NextResponse.redirect("https://app.myjobhack.co/roles", 302);
  }

  const admin = createAdminClient();
  // match jobs whose id (dash-stripped) starts with this code
  const { data } = await admin
    .from("jobs")
    .select("id, status")
    .eq("status", "published")
    .limit(200);

  const match = (data ?? []).find(
    (j) => j.id.replace(/-/g, "").toLowerCase().startsWith(code)
  );

  const dest = match
    ? `https://app.myjobhack.co/jobs/${match.id}`
    : "https://app.myjobhack.co/roles";
  return NextResponse.redirect(dest, 302);
}
