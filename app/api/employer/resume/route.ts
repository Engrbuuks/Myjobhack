import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactResumePdf, watermarkResumePdf } from "@/lib/redactResume";

export const runtime = "nodejs";

/**
 * Serves a résumé to an employer with contact details redacted — UNLESS
 * the employer has unlocked the candidate or recorded a placement, in which
 * case the original is returned. Applicant résumés never go out raw pre-unlock.
 * GET /api/employer/resume?application_id=... (or ?talent_id=...)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("application_id");
  const talentIdQ = searchParams.get("talent_id");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const isStaff = ["admin", "recruiter"].includes(me?.role ?? "");
  const isEmployer = me?.role === "employer";
  if (!isStaff && !isEmployer) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  // Resolve the résumé path + the talent it belongs to.
  let bucket = "documents"; let path: string | null = null; let talentId: string | null = talentIdQ;
  if (applicationId) {
    const { data: app } = await admin.from("applications")
      .select("talent_id, resume_document_id, guest_resume_path").eq("id", applicationId).maybeSingle();
    talentId = app?.talent_id ?? talentId;
    if (app?.guest_resume_path) { path = app.guest_resume_path; }
    else if (app?.resume_document_id) {
      const { data: doc } = await admin.from("documents").select("bucket, path").eq("id", app.resume_document_id).single();
      if (doc) { bucket = doc.bucket; path = doc.path; }
    }
  }
  if (!path) return NextResponse.json({ error: "No résumé on file." }, { status: 404 });

  // Has this employer earned the raw file? (unlock or recorded placement)
  let released = isStaff;
  if (isEmployer && talentId) {
    const [{ data: unlock }, { data: placement }] = await Promise.all([
      admin.from("profile_unlocks").select("id").eq("employer_id", user.id).eq("talent_id", talentId).maybeSingle(),
      admin.from("placements").select("id").eq("employer_id", user.id).eq("talent_id", talentId).maybeSingle()
    ]);
    released = !!unlock || !!placement;
  }

  // Fetch the original bytes.
  const { data: file, error } = await admin.storage.from(bucket).download(path);
  if (error || !file) return NextResponse.json({ error: "Could not read résumé." }, { status: 500 });
  const ab = await file.arrayBuffer();

  // Released → original, watermarked with the non-circumvention notice.
  if (released) {
    try {
      const stamped = await watermarkResumePdf(ab);
      return new NextResponse(Buffer.from(stamped), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=resume.pdf" } });
    } catch {
      return new NextResponse(ab, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=resume.pdf" } });
    }
  }

  try {
    const { bytes, warning } = await redactResumePdf(ab);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=resume-redacted.pdf",
        ...(warning ? { "X-Redaction-Warning": warning } : {})
      }
    });
  } catch {
    // If redaction fails, DO NOT leak the raw file — deny instead.
    return NextResponse.json({ error: "Résumé preview unavailable — unlock the candidate to view the full document." }, { status: 409 });
  }
}
