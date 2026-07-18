import { NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/ai-gate";
import { extractDocumentText } from "@/lib/extract";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const g = await requireSubscriber("resume-review");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });
  const { user, supabase } = g;

  const { data: talent } = await supabase
    .from("talent_profiles").select("resume_document_id").eq("profile_id", user!.id).single();
  if (!talent?.resume_document_id)
    return NextResponse.json({ error: "Upload your resume in your profile first." }, { status: 400 });

  const ex = await extractDocumentText(supabase, talent.resume_document_id);
  if (!ex.text) return NextResponse.json({ error: ex.error }, { status: 400 });

  const prompt = `You are a brutally honest African recruitment expert reviewing a resume.
Identify ONLY the loopholes, gaps, and weaknesses — do NOT rewrite the resume, do NOT provide corrected text.
For each issue: what it is, where it appears, why it hurts the candidate with employers, and severity.
Respond with ONLY this JSON:
{"overall_impression":"one honest sentence","score":0-100,"issues":[{"title":"...","location":"section/line hint","why_it_hurts":"...","severity":"critical|major|minor"}],"missing_elements":["things strong resumes in this market have that this one lacks"]}

RESUME TEXT:
${ex.text}`;

  const r = await geminiJson(prompt);
  if (!r.data) return NextResponse.json({ error: r.error }, { status: 500 });

  await supabase.from("ai_runs").insert({
    profile_id: user!.id, tool: "resume_review",
    input: { resume: ex.name }, output: r.data, model: "gemini-1.5-flash"
  });
  return NextResponse.json({ result: r.data });
}
