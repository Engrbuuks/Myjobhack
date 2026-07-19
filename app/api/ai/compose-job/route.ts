import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Draft a complete job posting from a title and a few hints.
 * Staff and employers only — this writes nothing, it returns a draft to review.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const allowed = ["admin", "recruiter", "employer"].includes(profile?.role ?? "");
  if (!allowed) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = await request.json();
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "A job title is needed to start." }, { status: 400 });

  const hints = [
    body.company ? `Company: ${body.company}` : "",
    body.location ? `Location: ${body.location}` : "",
    body.work_mode ? `Work mode: ${body.work_mode}` : "",
    body.employment_type ? `Employment type: ${String(body.employment_type).replace(/_/g, " ")}` : "",
    body.role_level ? `Seniority: ${body.role_level}` : "",
    body.salary_note ? `Salary: ${body.salary_note}` : "",
    body.notes ? `Extra context from the hiring manager: ${body.notes}` : ""
  ].filter(Boolean).join("\n");

  // niches, so the AI can pick one that exists rather than inventing a label
  const { data: niches } = await admin.from("niches").select("id, name").limit(60);
  const nicheList = (niches ?? []).map((n) => n.name).join(", ");

  const prompt = `You are an experienced recruiter writing a job posting for MYJOBHACK, a workforce platform operating across Africa. Write for African candidates — use African context, currencies, and city names naturally. Never invent facts about the company; if something is unknown, write it generically rather than inventing specifics.

ROLE TITLE: ${title}
${hints ? `\nKNOWN DETAILS:\n${hints}` : ""}

Produce a complete, publishable posting. Respond ONLY with JSON, no markdown fences, no preamble, in exactly this shape:

{
  "description": "Full job description in plain text with line breaks. Structure it as: a two-to-three sentence opening about the role and its impact; then 'What you'll do' with 5-6 bullet lines each starting with '- '; then 'What you'll bring' with 4-5 bullet lines each starting with '- '; then 'Why this role' with 2-3 bullet lines. Write in second person, active voice, specific and concrete. No fluff, no 'rockstar' or 'ninja' language, no emoji.",
  "key_requirements": ["4 to 6 short non-negotiable requirements, each under 15 words, the things that genuinely disqualify an applicant if missing"],
  "role_level": "one of: entry, mid, senior, lead, executive",
  "employment_type": "one of: full_time, part_time, contract, internship, temporary",
  "work_mode": "one of: onsite, hybrid, remote",
  "niche_suggestion": "the single closest match from this list, or empty string if none fit: ${nicheList}",
  "salary_note": "a realistic salary range for this role in the stated location, figures only without a currency symbol, e.g. '350,000 - 500,000 / month'. Empty string if location is unknown.",
  "salary_currency": "NGN, USD, GHS, KES, ZAR or GBP — infer from the location",
  "screening_questions": [
    {"label": "question text", "type": "short_text | long_text | number | yes_no | select", "required": true, "options": ["only for select type"], "why": "one line on what this question screens for"}
  ],
  "interview_focus": ["3 areas an interviewer should probe, each under 12 words"],
  "seo_summary": "a 150-character summary for search engines and social sharing"
}

Give 4 to 6 screening questions. Make them things a CV cannot answer — availability, right to work, specific tool experience with years, portfolio links, salary expectation. Prefer yes_no and number types where possible so answers can be auto-scored.`;

  const { data, error } = await geminiJson(prompt);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "The composer could not produce a draft. Try again." }, { status: 502 });
  }

  // map the suggested niche name back to a real id
  let niche_id: string | null = null;
  if (data.niche_suggestion) {
    const match = (niches ?? []).find(
      (n) => n.name.toLowerCase() === String(data.niche_suggestion).toLowerCase()
    );
    niche_id = match?.id ?? null;
  }

  await admin.from("ai_runs").insert({
    profile_id: user.id, tool: "compose-job",
    input: { title, hints }, output: data
  });

  return NextResponse.json({ ...data, niche_id });
}
