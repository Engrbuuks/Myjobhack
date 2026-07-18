import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, title, status, org_id, form_id").eq("id", job_id).single();
  if (!job || job.status !== "published")
    return NextResponse.json({ error: "This role is no longer open." }, { status: 404 });

  // one guest application per email per job
  const { data: dup } = await admin.from("applications")
    .select("id").eq("job_id", job_id).eq("guest_email", email).maybeSingle();
  if (dup) return NextResponse.json({ error: "You've already applied to this role with this email." }, { status: 409 });

  // store resume
  const safe = (resume.name || "resume.pdf").replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `guest-resumes/${crypto.randomUUID()}-${safe}`;
  const buf = Buffer.from(await resume.arrayBuffer());
  const { error: upErr } = await admin.storage.from("documents")
    .upload(path, buf, { contentType: resume.type || "application/pdf" });
  if (upErr) return NextResponse.json({ error: `Resume upload failed: ${upErr.message}` }, { status: 500 });

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
    guest_resume_path: path
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
  return NextResponse.json({ ok: true, shortlisted: status === "shortlisted" });
}
