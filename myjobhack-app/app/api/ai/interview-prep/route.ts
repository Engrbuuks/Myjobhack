import { NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/ai-gate";
import { extractDocumentText } from "@/lib/extract";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const g = await requireSubscriber("interview-prep");
  if (g.error) return NextResponse.json({ error: g.error }, { status: g.status });
  const { user, supabase } = g;

  const { company, website, role, jd_text, jd_document_id } = await request.json();
  if (!company || !role)
    return NextResponse.json({ error: "Company name and role are required" }, { status: 400 });

  let jd = (jd_text ?? "").slice(0, 16000);
  if (!jd && jd_document_id) {
    const ex = await extractDocumentText(supabase, jd_document_id);
    if (ex.text) jd = ex.text;
  }

  let resume = "";
  const { data: talent } = await supabase
    .from("talent_profiles").select("resume_document_id").eq("profile_id", user!.id).single();
  if (talent?.resume_document_id) {
    const ex = await extractDocumentText(supabase, talent.resume_document_id);
    if (ex.text) resume = ex.text.slice(0, 10000);
  }

  const prompt = `You are an elite interview coach preparing a candidate to ace an interview.
Company: ${company}${website ? ` (website: ${website})` : ""}
Role: ${role}
${jd ? `JOB DESCRIPTION:\n${jd}` : "No JD provided — infer from the role title and company."}
${resume ? `CANDIDATE RESUME:\n${resume}` : ""}

Produce everything needed to ace this interview. Respond with ONLY this JSON:
{"introduction":"a 60-90 second self-introduction script tailored to this role and candidate",
"company_angle":"what this company likely cares about and how to align",
"likely_questions":[{"question":"...","how_to_answer":"specific guidance with an example angle from the candidate's background"}],
"questions_to_ask":[{"question":"...","why_it_impresses":"..."}],
"red_flags_to_avoid":["..."],
"final_tips":["..."]}
Include 8-10 likely_questions (mix behavioural, technical for the role, and situational) and 4-5 questions_to_ask.`;

  const r = await geminiJson(prompt);
  if (!r.data) return NextResponse.json({ error: r.error }, { status: 500 });

  await supabase.from("ai_runs").insert({
    profile_id: user!.id, tool: "interview_prep",
    input: { company, role, has_jd: !!jd }, output: r.data, model: (r as any).model ?? "gemini"
  });
  return NextResponse.json({ result: r.data });
}
