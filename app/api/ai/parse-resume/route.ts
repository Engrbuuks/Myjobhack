import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText } from "@/lib/extract";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Read a seeker's uploaded résumé and propose work-history entries.
 *
 * Deliberately a SUGGESTION, never a silent write. The structured profile is
 * what employers evaluate, so a hallucinated job title or invented date is
 * worse than an empty field — the candidate reviews and confirms every entry.
 */
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: talent } = await supabase.from("talent_profiles")
    .select("resume_document_id").eq("profile_id", user.id).maybeSingle();
  if (!talent?.resume_document_id)
    return NextResponse.json({ error: "Upload your résumé first — there's nothing to read yet." }, { status: 400 });

  const ex = await extractDocumentText(supabase, talent.resume_document_id);
  if (ex.error || !ex.text)
    return NextResponse.json({
      error: "We couldn't read text from that file. If it's a scan or an image, the text can't be extracted — you'll need to add your roles manually."
    }, { status: 422 });

  const text = ex.text.slice(0, 18000);

  const prompt = `Extract the WORK EXPERIENCE from this résumé.

RULES — accuracy matters far more than completeness:
- Only include roles actually stated in the text. Never infer, guess or embellish.
- If a field is not clearly stated, use null. Do NOT invent dates, titles or companies.
- Dates as YYYY-MM. If only a year is given, use YYYY-01. If it is the current role, end_date must be null and is_current true.
- summary: 1-2 plain sentences of what they actually did, drawn from the résumé's own wording. No adjectives the résumé does not use. No "responsible for". Start with a verb.
- Exclude education, certifications, referees, skills lists and personal details — work roles only.
- Order most recent first.
- If you cannot find any work experience, return an empty array. That is a valid answer.

RÉSUMÉ TEXT:
"""
${text}
"""

Return ONLY JSON, no markdown fences:
{
  "experiences": [
    {
      "title": "Senior Accountant",
      "company": "Dangote Group",
      "employment_type": "full_time",
      "start_date": "2020-03",
      "end_date": "2024-01",
      "is_current": false,
      "location": "Lagos",
      "summary": "Managed financial reporting for a team of 12 and led the monthly close."
    }
  ],
  "confidence": "high | medium | low",
  "note": "one sentence on anything unclear or missing"
}`;

  const { data, error } = await geminiJson(prompt);
  if (error || !Array.isArray(data?.experiences))
    return NextResponse.json({ error: "Could not read the work history from this résumé. Please add your roles manually." }, { status: 502 });

  const EMPLOYMENT = ["full_time", "part_time", "contract", "internship", "temporary"];
  const clean = (data.experiences as any[])
    .filter(e => e?.title || e?.company)          // useless without one of these
    .slice(0, 12)
    .map((e: any) => ({
      title: String(e.title ?? "").slice(0, 120),
      company: String(e.company ?? "").slice(0, 120),
      employment_type: EMPLOYMENT.includes(e.employment_type) ? e.employment_type : "full_time",
      // Normalise YYYY-MM to a real date, and drop anything malformed.
      start_date: /^\d{4}-\d{2}$/.test(e.start_date ?? "") ? `${e.start_date}-01` : null,
      end_date: e.is_current ? null : (/^\d{4}-\d{2}$/.test(e.end_date ?? "") ? `${e.end_date}-01` : null),
      is_current: !!e.is_current,
      location: e.location ? String(e.location).slice(0, 120) : null,
      summary: e.summary ? String(e.summary).slice(0, 600) : null
    }));

  return NextResponse.json({
    ok: true,
    experiences: clean,
    confidence: ["high", "medium", "low"].includes(data.confidence) ? data.confidence : "medium",
    note: data.note ? String(data.note).slice(0, 220) : null,
    source_file: ex.name ?? "your résumé"
  });
}
