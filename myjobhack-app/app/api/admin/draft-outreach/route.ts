import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geminiJson } from "@/lib/gemini";
import { templateByKey } from "@/lib/outreach";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AI-drafted outreach for a specific prospect.
 *
 * The templates already carry the structure. What a template cannot do is write
 * the one specific observation about THIS company that makes an email feel
 * written rather than sent — that line is the single biggest driver of replies.
 * This drafts it, grounded only in what we actually know.
 */

const TONE_GUIDE = `
HOW TO WRITE
Write like a capable person emailing a busy stranger they respect. Not a marketer.

DO:
- Short sentences. Plain words. British-Nigerian business English.
- Lead with THEIR situation, never with our product.
- One clear ask, small enough to say yes to.
- Contractions are fine. It should sound spoken.
- Specific over impressive: "40 agent seats" beats "scalable talent solutions".

NEVER:
- No "I hope this email finds you well", "reaching out", "circle back", "synergy",
  "leverage", "cutting-edge", "revolutionary", "game-changing", "seamless".
- No exclamation marks. No emoji. No bold or ALL-CAPS for emphasis.
- No flattery about their company. No invented statistics or fake urgency.
- Never claim we have candidates, clients or results we have not been told about.
- Do not say "just following up" — say something new instead.

LENGTH: 90-150 words for a first email. 40-70 for a follow-up.
`;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { prospect_id, template_key, angle, observation } = await request.json();

  const { data: p } = await admin.from("employer_prospects").select("*").eq("id", prospect_id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Prospect not found." }, { status: 404 });

  // What we genuinely know — so the AI grounds the email in fact, not invention.
  const { data: history } = await admin.from("prospect_activity")
    .select("kind, subject, body, created_at").eq("prospect_id", prospect_id)
    .order("created_at", { ascending: false }).limit(4);

  // Real pool depth, so any number in the email is true.
  let poolCount = 0;
  if (p.hires_roles) {
    const { count } = await admin.from("talent_profiles")
      .select("profile_id", { count: "exact", head: true })
      .not("competency_band", "is", null);
    poolCount = count ?? 0;
  }

  const tpl = templateByKey(template_key ?? "hr_lead");

  const prompt = `You are writing a real business email on behalf of MYJOBHACK, a Nigerian talent platform.

WHAT MYJOBHACK ACTUALLY DOES (do not embellish beyond this):
Every candidate in our pool completes a practical, role-specific assessment before an employer sees them, so they arrive with a competency band — evidence of what they can do, not just CV claims. Employers can search that pool, order deeper job-specific tests for finalists, and hire. We currently hold ${poolCount} assessed candidates.

WHO YOU ARE WRITING TO:
Company: ${p.company}${p.sector ? ` (${p.sector})` : ""}
Contact: ${p.contact_name || "unknown name"}${p.contact_role ? `, ${p.contact_role}` : ""}
Location: ${p.city || "unknown"}
Roles they hire: ${p.hires_roles || "unknown"}
Hiring right now: ${p.hiring_now ? "yes" : "no — they hire periodically but have nothing open"}
Times we have emailed before: ${p.touches}
${history?.length ? `\nPREVIOUS CONTACT (do not repeat these points):\n${history.filter((h: any) => h.kind === "email").map((h: any) => `- "${h.subject}"`).join("\n")}` : ""}

${observation ? `SPECIFIC THING THE SENDER NOTICED (build the opening line around this, in their own words):\n${observation}` : `NOTE: the sender has not given a specific observation. Write the opening so it reads naturally WITHOUT inventing one — refer only to what is listed above (their sector, the roles they hire). Do NOT fabricate a job posting, an expansion, or any news.`}

EMAIL TYPE: ${tpl.label}
Purpose: ${tpl.when}
${angle ? `The sender wants this angle: ${angle}` : ""}

${TONE_GUIDE}

Return ONLY JSON, no markdown fences:
{
  "subject": "under 60 characters, names their problem not our product",
  "body": "the email body, no signature block — plain text with blank lines between paragraphs",
  "why": "one sentence on why this angle should work for this contact"
}`;

  const { data, error } = await geminiJson(prompt);
  if (error || !data?.body) {
    // Fall back to the static template rather than failing the user.
    return NextResponse.json({
      subject: tpl.subject(p as any),
      body: tpl.body(p as any, { poolCount }),
      why: "AI drafting was unavailable — this is the standard template, ready to edit.",
      fallback: true
    });
  }

  return NextResponse.json({
    subject: String(data.subject ?? tpl.subject(p as any)).slice(0, 120),
    body: String(data.body).trim(),
    why: String(data.why ?? ""),
    pool_count: poolCount
  });
}
