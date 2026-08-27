import { NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/ai-gate";
import { extractDocumentText } from "@/lib/extract";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const g = await requireSubscriber("skills-gap");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });
  const { user, supabase } = g;

  const [{ data: talent }, { data: expertise }, { data: taxonomies }] = await Promise.all([
    supabase.from("talent_profiles").select("*").eq("profile_id", user!.id).single(),
    supabase.from("talent_expertise").select("taxonomy_id").eq("talent_id", user!.id),
    supabase.from("taxonomies").select("id, label")
  ]);
  const tmap = new Map((taxonomies ?? []).map((t) => [t.id, t.label]));
  const niche = talent?.niche_id ? tmap.get(talent.niche_id) : "not set";
  const goal = talent?.career_goal_id ? tmap.get(talent.career_goal_id) : "not set";
  const skills = (expertise ?? []).map((e) => tmap.get(e.taxonomy_id)).filter(Boolean).join(", ") || "not set";

  let resume = "";
  if (talent?.resume_document_id) {
    const ex = await extractDocumentText(supabase, talent.resume_document_id);
    if (ex.text) resume = ex.text.slice(0, 10000);
  }

  const prompt = `You are a labour-market analyst focused on African and global remote job markets in ${new Date().getFullYear()}.
Candidate profile:
- Niche: ${niche}
- Career goal: ${goal}
- Declared expertise: ${skills}
- Experience: ${talent?.years_experience ?? 0} years, targeting ${talent?.expected_role_level ?? "unspecified"} level, ${talent?.preferred_work_mode ?? "any"} work
${resume ? `RESUME:\n${resume}` : ""}

Analyse the gap between this candidate and current market demand in their niche. Respond with ONLY this JSON:
{"market_summary":"2-3 sentences on current demand and trends in their niche",
"strengths":["skills they have that the market values now"],
"gaps":[{"skill":"...","why_in_demand":"...","priority":"high|medium|low","how_to_close":"concrete first step (course type, certification, project)"}],
"emerging_trends":["trends in their niche worth positioning for early"],
"six_month_plan":"one paragraph: what to learn in what order for maximum employability"}
Include 4-6 gaps ordered by priority.`;

  const r = await geminiJson(prompt);
  if (!r.data) return NextResponse.json({ error: r.error }, { status: 500 });

  await supabase.from("ai_runs").insert({
    profile_id: user!.id, tool: "skills_gap",
    input: { niche, goal }, output: r.data, model: (r as any).model ?? "gemini"
  });
  return NextResponse.json({ result: r.data });
}
