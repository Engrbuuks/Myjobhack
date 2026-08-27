import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is missing the fields the platform depends on. Location matters most:
 * employers filter by it, matching weights it, and chapters are assigned by city.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { data: people } = await admin.from("profiles")
    .select("id, full_name, email, role, country, city, created_at")
    .in("role", ["job_seeker", "elite_member"])
    .order("created_at", { ascending: false });

  const all = people ?? [];
  const missing = all.filter(p => !p.country?.trim() || !p.city?.trim());

  return NextResponse.json({
    total: all.length,
    missing_location: missing.length,
    complete_location: all.length - missing.length,
    percent_complete: all.length ? Math.round(((all.length - missing.length) / all.length) * 100) : 100,
    people: missing.map(p => ({
      id: p.id, name: p.full_name ?? "—", email: p.email, role: p.role,
      country: p.country ?? null, city: p.city ?? null,
      joined: p.created_at
    }))
  }, { headers: { "Cache-Control": "no-store" } });
}
