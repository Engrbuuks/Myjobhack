import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText, extractTextFromPath } from "@/lib/extract";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Score applicants who arrived before AI scoring existed for their route.
 *
 * Guest applications were never scored, so a job with only guest applicants
 * shows no ranking at all. This backfills them so the pool can be judged.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter", "employer"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { job_id, limit } = await request.json();
  if (!job_id) return NextResponse.json({ error: "job_id is required." }, { status: 400 });

  const { data: job } = await admin.from("jobs")
    .select("id, title, description, jd_document_id").eq("id", job_id).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  // The job description is what we score against — without it there is nothing to compare.
  let jd = (job.description ?? "").slice(0, 4000);
  if (jd.length < 200 && job.jd_document_id) {
    const ex = await extractDocumentText(admin as any, job.jd_document_id);
    if (ex.text) jd = ex.text.slice(0, 4000);
  }
  if (jd.length < 120)
    return NextResponse.json({
      error: "This job has no usable description to score against. Add a fuller description first — the AI needs something to compare CVs to."
    }, { status: 400 });

  const { data: apps } = await admin.from("applications")
    .select("id, talent_id, guest_resume_path, guest_resume_bucket, resume_document_id, guest_name")
    .eq("job_id", job_id).is("ai_fit_score", null)
    .limit(Math.min(Number(limit) || 40, 60));

  if (!apps?.length)
    return NextResponse.json({ ok: true, scored: 0, message: "Every applicant already has a fit score." });

  let scored = 0, noCv = 0, unreadable = 0, rateLimited = 0;

  // The free Gemini tier allows roughly 10-15 requests per minute. Firing a
  // batch in a tight loop means most calls come back 429. Pace them instead —
  // ~5 seconds apart keeps us safely inside the limit.
  const PACE_MS = Number(process.env.AI_PACE_MS) || 5000;
  let first = true;

  for (const a of apps) {
    if (!first) await new Promise(r => setTimeout(r, PACE_MS));
    first = false;
    let cvText: string | null = null;

    if (a.guest_resume_path) {
      const r = await extractTextFromPath(admin as any, a.guest_resume_bucket || "guest-uploads", a.guest_resume_path);
      cvText = r.text;
      if (!r.text) unreadable++;
    } else if (a.resume_document_id) {
      const r = await extractDocumentText(admin as any, a.resume_document_id);
      cvText = r.text;
      if (!r.text) unreadable++;
    } else {
      noCv++;
      continue;
    }
    if (!cvText) continue;

    try {
      const r = await geminiJson(
        `You are screening a candidate CV against a job description for "${job.title}".
Be honest and specific — an inflated score is worse than a low one.
Respond with ONLY this JSON: {"fit_score":0-100,"summary":"2-3 sentences naming the strongest match and the biggest gap"}
JOB DESCRIPTION:\n${jd}\n\nCANDIDATE CV:\n${cvText.slice(0, 6000)}`
      );
      if (r.data?.fit_score != null) {
        await admin.from("applications").update({
          ai_fit_score: Math.max(0, Math.min(100, Number(r.data.fit_score))),
          ai_summary: String(r.data.summary ?? "")
        }).eq("id", a.id);
        scored++;
      }
    } catch (e: any) {
      // A 429 means we are being throttled — worth reporting, not swallowing.
      if (String(e?.message ?? "").includes("429") || String(e?.message ?? "").toLowerCase().includes("quota")) {
        rateLimited++;
      }
    }
  }

  return NextResponse.json({
    ok: true, scored, no_cv: noCv, unreadable, rate_limited: rateLimited,
    remaining: Math.max(0, (apps.length - scored)),
    message: `Scored ${scored} applicant${scored === 1 ? "" : "s"}.` +
      (noCv ? ` ${noCv} had no CV attached.` : "") +
      (unreadable ? ` ${unreadable} had a CV we couldn't read (likely scans).` : "") +
      (rateLimited ? ` ${rateLimited} hit the AI rate limit — wait a minute and run again.` : "") +
      (apps.length >= 40 ? " Run again to continue — they're processed in batches." : "")
  });
}
