import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAssessment } from "@/lib/assessment";
import { getPricing } from "@/lib/pricing";

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

  // Elite members get free assessments but capped, so they don't drain AI/review budget.
  const { data: elite } = await admin.from("elite_memberships")
    .select("status").eq("talent_id", user.id).maybeSingle();
  if (elite && elite.status === "verified") {
    const pricing = await getPricing();
    const { data: tpUsed } = await admin.from("talent_profiles")
      .select("free_assessments_used").eq("profile_id", user.id).maybeSingle();
    const used = tpUsed?.free_assessments_used ?? 0;
    if (used >= pricing.elite_free_assessments) {
      return NextResponse.json({
        error: `You've used your ${pricing.elite_free_assessments} included assessments. Further assessments are available on the premium track.`,
        capped: true
      }, { status: 402 });
    }
  }

  const level = (tp?.expected_role_level as string) ?? "mid";
  // Never issue this candidate a question they have already seen, and give
  // every sitting its own variant seed so two candidates rarely share a paper.
  const { data: seen } = await admin.from("issued_questions")
    .select("prompt_hash").eq("talent_id", user.id).order("created_at", { ascending: false }).limit(40);

  const { data: priorAsmts } = await admin.from("assessments")
    .select("questions").eq("talent_id", user.id).order("created_at", { ascending: false }).limit(4);
  const avoidPrompts: string[] = [];
  for (const a of priorAsmts ?? []) {
    for (const q of ((a.questions as any[]) ?? [])) {
      if (q?.prompt) avoidPrompts.push(String(q.prompt).slice(0, 160));
    }
  }

  const seed = `${user.id.slice(0, 4)}${Date.now().toString(36).slice(-5)}`;
  const gen = await generateAssessment({ field, level, skills, seed, avoidPrompts });
  if (gen.error || !gen.questions.length)
    return NextResponse.json({ error: gen.error ?? "Could not generate an assessment. Try again." }, { status: 502 });

  const { data: asmt, error } = await admin.from("assessments").insert({
    talent_id: user.id, niche_id: tp?.niche_id ?? null, field_label: field,
    role_level: level as any, status: "generated", generated_by: gen.model ?? null,
    questions: gen.questions, time_limit_min: gen.time_limit_min,
    variant_seed: gen.seed ?? null, question_count: gen.questions.length, difficulty: gen.difficulty ?? null
  }).select("id, questions, time_limit_min").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fingerprint every prompt issued, so future papers can avoid them.
  try {
    const { createHash } = await import("crypto");
    const rows = gen.questions.map((q) => ({
      talent_id: user.id,
      prompt_hash: createHash("sha256").update(String(q.prompt).toLowerCase().trim()).digest("hex").slice(0, 32),
      field_label: field
    }));
    if (rows.length) await admin.from("issued_questions").insert(rows);
  } catch { /* fingerprinting is best-effort — never block the assessment */ }

  // Count this against the Elite free allowance.
  if (elite && elite.status === "verified") {
    const { data: tpc } = await admin.from("talent_profiles").select("free_assessments_used").eq("profile_id", user.id).maybeSingle();
    await admin.from("talent_profiles").update({ free_assessments_used: (tpc?.free_assessments_used ?? 0) + 1 }).eq("profile_id", user.id);
  }

  // Strip rubrics before sending to the client (don't reveal the marking scheme)
  const clientQuestions = (asmt.questions as any[]).map(({ rubric, max_points, ...q }) => q);
  return NextResponse.json({ ok: true, id: asmt.id, questions: clientQuestions, time_limit_min: asmt.time_limit_min });
}
