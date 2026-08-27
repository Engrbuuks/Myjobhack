import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateRules, FieldDef } from "@/lib/rules";
import { extractDocumentText } from "@/lib/extract";
import { geminiJson } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { job_id, answers } = await request.json();
  if (!job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const { data: job } = await supabase
    .from("jobs").select("id, title, description, status, form_id, jd_document_id").eq("id", job_id).single();
  if (!job || job.status !== "published")
    return NextResponse.json({ error: "This role is not open for applications" }, { status: 400 });

  const { data: talent } = await supabase
    .from("talent_profiles").select("resume_document_id, profile_completion").eq("profile_id", user.id).single();
  if (!talent?.resume_document_id)
    return NextResponse.json({ error: "Upload your resume in your profile before applying." }, { status: 400 });

  // Location is compulsory — employers filter and match on it, and a candidate
  // with no country/city is effectively invisible in the pool.
  const { data: loc } = await supabase.from("profiles")
    .select("country, city").eq("id", user.id).maybeSingle();
  if (!loc?.country?.trim() || !loc?.city?.trim())
    return NextResponse.json({
      error: "Add your country and city/state in your profile before applying — employers search by location.",
      needs_location: true
    }, { status: 400 });

  // required-field + eligibility evaluation
  let fields: FieldDef[] = [];
  if (job.form_id) {
    const { data } = await supabase.from("form_fields").select("*").eq("form_id", job.form_id).order("sort");
    fields = (data ?? []) as any;
    for (const f of fields) {
      const v = (answers ?? {})[f.id];
      if (f.required && (v == null || v === "" || (Array.isArray(v) && v.length === 0)))
        return NextResponse.json({ error: `"${f.label}" is required` }, { status: 400 });
    }
  }
  const evalResult = evaluateRules(fields, answers ?? {});

  const admin2 = createAdminClient();
  const { data: me } = await admin2.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();

  const { data: app, error: insErr } = await supabase.from("applications").insert({
    job_id, talent_id: user.id,
    answers: answers ?? {}, resume_document_id: talent.resume_document_id,
    rules_passed: fields.some((f) => f.eligibility) ? evalResult.passed : null,
    status: fields.some((f) => f.eligibility)
      ? (evalResult.passed ? "shortlisted" : "rules_failed")
      : "submitted"
  }).select("id, status").single();
  if (insErr) {
    const dup = insErr.message.includes("duplicate") || insErr.code === "23505";
    return NextResponse.json({ error: dup ? "You've already applied to this role." : insErr.message }, { status: 400 });
  }

  // AI fit score — CV vs JD (best effort; never blocks the application)
  let ai: { fit_score?: number; summary?: string } | null = null;
  try {
    let jd = (job.description ?? "").slice(0, 12000);
    if (jd.length < 200 && job.jd_document_id) {
      const ex = await extractDocumentText(supabase, job.jd_document_id);
      if (ex.text) jd = ex.text.slice(0, 12000);
    }
    const cv = await extractDocumentText(supabase, talent.resume_document_id);
    if (jd.length >= 120 && cv.text) {
      const r = await geminiJson(
        `You are screening a candidate CV against a job description for "${job.title}".
Respond with ONLY this JSON: {"fit_score":0-100,"summary":"2-3 sentence honest assessment of fit, naming the strongest match and the biggest gap"}
JOB DESCRIPTION:\n${jd}\n\nCANDIDATE CV:\n${cv.text.slice(0, 12000)}`
      );
      if (r.data?.fit_score != null) {
        ai = r.data;
        const admin = createAdminClient();
        await admin.from("applications").update({
          ai_fit_score: Math.max(0, Math.min(100, Number(r.data.fit_score))),
          ai_summary: String(r.data.summary ?? "")
        }).eq("id", app.id);
      }
    }
  } catch { /* scoring is best-effort */ }

  // tell the hiring side
  try {
    const notifyAdmin = createAdminClient();
    const { data: jobOrg } = await notifyAdmin.from("jobs").select("org_id, title").eq("id", job_id).single();
    if (jobOrg?.org_id) {
      const { data: members } = await notifyAdmin.from("org_members").select("profile_id").eq("org_id", jobOrg.org_id);
      for (const m of members ?? []) {
        await notifyAdmin.from("notifications").insert({
          profile_id: m.profile_id, title: "New application 📥",
          body: `Someone applied to "${jobOrg.title}"${app.status === "shortlisted" ? " — and passed your rules (auto-shortlisted)" : ""}.`,
          link: `/portal/employer/jobs/${job_id}/applicants`
        });
      }
    }
  } catch { /* best effort */ }

  await supabase.from("activity_log").insert({
    actor_id: user.id, action: "Applied to job", entity: "application", entity_id: app.id,
    meta: { job: job.title, auto: app.status, rules_failures: evalResult.failures }
  });

  return NextResponse.json({
    status: app.status,
    shortlisted: app.status === "shortlisted",
    ai_scored: !!ai
  });
}
