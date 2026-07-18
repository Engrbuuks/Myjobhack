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

  const prompt = `You are an elite African recruitment expert reviewing a candidate's resume. Be honest AND constructive — every problem you find must come with the exact fix.
For each issue: what it is, where it appears, why it hurts with employers, severity, a CONCRETE instruction for what to change, and a rewritten EXAMPLE line the candidate can adapt (use their real details from the resume, never placeholders like [Company]).
Then list what's MISSING: things strong resumes in this market have that this one lacks — each with why it matters and an example of what to add.
Finish with the three moves that would most improve this resume, in priority order.
Respond with ONLY this JSON:
{"overall_impression":"one honest sentence",
 "score":0-100,
 "issues":[{"title":"...","location":"section/line hint","why_it_hurts":"...","severity":"critical|major|minor","fix":"exactly what to change","example":"a rewritten line using their real details"}],
 "additions":[{"what":"the missing element","why":"why employers expect it","example":"a sample line/section they could add"}],
 "top_moves":["#1 priority action","#2","#3"]}

RESUME TEXT:
${ex.text}`;

  const r = await geminiJson(prompt);
  if (!r.data) return NextResponse.json({ error: r.error }, { status: 500 });

  await supabase.from("ai_runs").insert({
    profile_id: user!.id, tool: "resume_review",
    input: { resume: ex.name, resume_document_id: talent.resume_document_id }, output: r.data, model: (r as any).model ?? "gemini"
  });
  return NextResponse.json({ result: r.data });
}
