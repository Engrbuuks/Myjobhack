import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAssessment } from "@/lib/assessment";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();

  // Pull the candidate's field/title/level/skills to generate a tailored test.
  const { data: tp } = await admin.from("talent_profiles")
    .select("niche_id, headline, expected_role_level, custom_skills").eq("profile_id", user.id).maybeSingle();

  let field = tp?.headline?.trim() || "";
  if (!field && tp?.niche_id) {
    const { data: tax } = await admin.from("taxonomies").select("label").eq("id", tp.niche_id).maybeSingle();
    field = tax?.label ?? "";
  }
  if (!field) return NextResponse.json({ error: "Add your title/headline and niche to your profile first." }, { status: 400 });

  // Gather declared skills (taxonomy expertise labels + custom)
  const { data: exp } = await admin.from("talent_expertise").select("taxonomy_id").eq("talent_id", user.id);
  let skills: string[] = tp?.custom_skills ?? [];
  if (exp?.length) {
    const { data: labels } = await admin.from("taxonomies").select("label").in("id", exp.map((e: any) => e.taxonomy_id));
    skills = [...skills, ...(labels ?? []).map((l: any) => l.label)];
  }

  const level = (tp?.expected_role_level as string) ?? "mid";
  const gen = await generateAssessment({ field, level, skills });
  if (gen.error || !gen.questions.length)
    return NextResponse.json({ error: gen.error ?? "Could not generate an assessment. Try again." }, { status: 502 });

  const { data: asmt, error } = await admin.from("assessments").insert({
    talent_id: user.id, niche_id: tp?.niche_id ?? null, field_label: field,
    role_level: level as any, status: "generated", generated_by: gen.model ?? null,
    questions: gen.questions, time_limit_min: gen.time_limit_min
  }).select("id, questions, time_limit_min").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Strip rubrics before sending to the client (don't reveal the marking scheme)
  const clientQuestions = (asmt.questions as any[]).map(({ rubric, max_points, ...q }) => q);
  return NextResponse.json({ ok: true, id: asmt.id, questions: clientQuestions, time_limit_min: asmt.time_limit_min });
}
