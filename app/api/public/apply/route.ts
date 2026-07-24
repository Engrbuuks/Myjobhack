import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText, extractTextFromPath } from "@/lib/extract";
import { geminiJson } from "@/lib/gemini";
import { MAX_FILE_BYTES, ALLOWED_DOC_TYPES, humanBytes, logUpload } from "@/lib/storage";
import { evaluateRules } from "@/lib/rules";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const fd = await request.formData();
  if (String(fd.get("website") ?? "")) return NextResponse.json({ ok: true }); // honeypot: silently drop bots

  const job_id = String(fd.get("job_id") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const phone = String(fd.get("phone") ?? "").trim();
  const country = String(fd.get("country") ?? "").trim();
  const city = String(fd.get("city") ?? "").trim();
  const answersRaw = String(fd.get("answers") ?? "{}");
  const resume = fd.get("resume") as File | null;

  if (!job_id || !name || !email.includes("@"))
    return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
  if (!resume || resume.size === 0)
    return NextResponse.json({ error: "Attach your resume — employers here expect one." }, { status: 400 });
  if (resume.size > 5 * 1024 * 1024)
    return NextResponse.json({ error: "Resume must be under 5MB." }, { status: 400 });

  const admin = createAdminClient();
  const { data: job } = await admin.from("jobs")
    .select("id, title, status, org_id, form_id, description, jd_document_id").eq("id", job_id).single();
  if (!job || job.status !== "published")
    return NextResponse.json({ error: "This role is no longer open." }, { status: 404 });

  // one guest application per email per job
  const { data: dup } = await admin.from("applications")
    .select("id").eq("job_id", job_id).eq("guest_email", email).maybeSingle();
  if (dup) return NextResponse.json({ error: "You've already applied to this role with this email." }, { status: 409 });

  // store resume
  if (resume.size > MAX_FILE_BYTES)
    return NextResponse.json({ error: `Resume is too large. Maximum ${humanBytes(MAX_FILE_BYTES)}.` }, { status: 400 });
  if (resume.type && !ALLOWED_DOC_TYPES.includes(resume.type))
    return NextResponse.json({ error: "Resume must be a PDF or Word document." }, { status: 400 });

  const safe = (resume.name || "resume.pdf").replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safe}`;
  const buf = Buffer.from(await resume.arrayBuffer());
  const { error: upErr } = await admin.storage.from("guest-uploads")
    .upload(path, buf, { contentType: resume.type || "application/pdf" });
  if (upErr) return NextResponse.json({ error: `Resume upload failed: ${upErr.message}` }, { status: 500 });
  await logUpload({ bucket: "guest-uploads", path, profileId: null, kind: "guest_resume", bytes: resume.size });

  // required answers + auto-shortlisting rules — guests get the same fair machine
  let answers: Record<string, any> = {};
  try { answers = JSON.parse(answersRaw); } catch {}
  const { data: fields } = job.form_id
    ? await admin.from("form_fields").select("*").eq("form_id", job.form_id).order("sort")
    : { data: [] as any[] };
  for (const f of fields ?? []) {
    const v = answers[f.id];
    if (f.required && (v == null || v === "" || (Array.isArray(v) && v.length === 0)))
      return NextResponse.json({ error: `"${f.label}" is required.` }, { status: 400 });
  }
  const hasRules = (fields ?? []).some((f: any) => f.eligibility_op);
  const verdict = evaluateRules(fields ?? [], answers);
  const status = !hasRules ? "submitted" : verdict.passed ? "shortlisted" : "rules_failed";

  const { data: app, error } = await admin.from("applications").insert({
    job_id, talent_id: null, status,
    guest_name: name, guest_email: email, guest_phone: phone || null,
    answers: { ...answers, _location: [city, country].filter(Boolean).join(", ") },
    guest_resume_path: path,
    guest_resume_bucket: "guest-uploads"
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // AI fit score — CV against the job description. Signed-in applicants have
  // always been scored; guests were not, which left a job with only guest
  // applicants completely unranked. Best effort: never blocks the application.
  try {
    let jd = (job.description ?? "").slice(0, 12000);
    if (jd.length < 200 && (job as any).jd_document_id) {
      const ex = await extractDocumentText(admin as any, (job as any).jd_document_id);
      if (ex.text) jd = ex.text.slice(0, 12000);
    }
    if (jd.length >= 120 && path) {
      const cv = await extractTextFromPath(admin as any, "guest-uploads", path);
      if (cv.text) {
        const r = await geminiJson(
          `You are screening a candidate CV against a job description for "${job.title}".
Respond with ONLY this JSON: {"fit_score":0-100,"summary":"2-3 sentence honest assessment of fit, naming the strongest match and the biggest gap"}
JOB DESCRIPTION:\n${jd}\n\nCANDIDATE CV:\n${cv.text.slice(0, 12000)}`
        );
        if (r.data?.fit_score != null) {
          await admin.from("applications").update({
            ai_fit_score: Math.max(0, Math.min(100, Number(r.data.fit_score))),
            ai_summary: String(r.data.summary ?? "")
          }).eq("id", app.id);
        }
      }
    }
  } catch { /* scoring is best-effort */ }

  // tell the hiring side
  if (job.org_id) {
    const { data: members } = await admin.from("org_members").select("profile_id").eq("org_id", job.org_id);
    for (const m of members ?? []) {
      await admin.from("notifications").insert({
        profile_id: m.profile_id, title: "New application 📥",
        body: `${name} applied to "${job.title}"${status === "shortlisted" ? " — and passed your rules (auto-shortlisted)" : ""}.`,
        link: `/portal/employer/jobs/${job_id}/applicants`
      });
    }
  }
  // Add the applicant to the marketing database (consented via apply).
  await admin.rpc("upsert_marketing_contact", {
    p_email: email, p_name: name, p_source: "application", p_job_id: job_id, p_profile: null
  });

  return NextResponse.json({ ok: true, shortlisted: status === "shortlisted" });
}
