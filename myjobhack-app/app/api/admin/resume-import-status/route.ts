import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who could benefit from résumé import: people with a CV on file but no
 * structured work history. This is the gap that makes a profile unevaluable.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { data: talents } = await admin.from("talent_profiles")
    .select("profile_id, resume_document_id");

  const all = talents ?? [];
  const withResume = all.filter(t => t.resume_document_id);

  // Who already has work history?
  const ids = withResume.map(t => t.profile_id);
  let haveExperience = new Set<string>();
  if (ids.length) {
    const { data: exp } = await admin.from("work_experiences")
      .select("talent_id").in("talent_id", ids);
    haveExperience = new Set((exp ?? []).map((e: any) => e.talent_id));
  }

  const canBenefit = withResume.filter(t => !haveExperience.has(t.profile_id));

  // Names, so you can chase them or run it for them.
  const people = await Promise.all(canBenefit.slice(0, 200).map(async (t) => {
    const { data: p } = await admin.from("profiles")
      .select("full_name, email").eq("id", t.profile_id).maybeSingle();
    return { id: t.profile_id, name: p?.full_name ?? "—", email: p?.email ?? "" };
  }));

  return NextResponse.json({
    total_talent: all.length,
    with_resume: withResume.length,
    with_experience_already: haveExperience.size,
    could_benefit: canBenefit.length,
    people,
    note: canBenefit.length
      ? `${canBenefit.length} people have a résumé on file but no structured work history. Their profiles are far weaker to employers than they need to be.`
      : "Everyone with a résumé already has work history recorded."
  }, { headers: { "Cache-Control": "no-store" } });
}
