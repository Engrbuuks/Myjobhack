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
  // Résumés live in one of three places: a guest upload bucket, the documents
  // bucket, or R2. Resolving this wrongly returned an empty response with no
  // error, which looked like "the résumé won't open".
  let location: { provider: "r2" | "supabase"; bucket: string; path: string } | null = null;
  let talentId: string | null = talentIdQ;

  if (applicationId) {
    const { data: app } = await admin.from("applications")
      .select("talent_id, resume_document_id, guest_resume_path, guest_resume_bucket, guest_resume_provider")
      .eq("id", applicationId).maybeSingle();
    talentId = app?.talent_id ?? talentId;

    if (app?.guest_resume_path) {
      location = {
        provider: (app.guest_resume_provider === "r2" ? "r2" : "supabase"),
        bucket: app.guest_resume_bucket || "guest-uploads",
        path: app.guest_resume_path
      };
    } else if (app?.resume_document_id) {
      const { data: doc } = await admin.from("documents")
        .select("bucket, path, storage_provider").eq("id", app.resume_document_id).maybeSingle();
      if (doc) {
        const { locationFromDocument } = await import("@/lib/storage");
        location = locationFromDocument(doc as any);
      }
    }
  } else if (talentId) {
    // Fall back to the talent's profile résumé.
    const { data: tp } = await admin.from("talent_profiles")
      .select("resume_document_id").eq("profile_id", talentId).maybeSingle();
    if (tp?.resume_document_id) {
      const { data: doc } = await admin.from("documents")
        .select("bucket, path, storage_provider").eq("id", tp.resume_document_id).maybeSingle();
      if (doc) {
        const { locationFromDocument } = await import("@/lib/storage");
        location = locationFromDocument(doc as any);
      }
    }
  }
  if (!location) return NextResponse.json({ error: "No résumé on file for this applicant." }, { status: 404 });

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
  const { downloadFile } = await import("@/lib/storage");
  const dl = await downloadFile({ supabase: admin as any, location });
  if (dl.error || !dl.buffer)
    return NextResponse.json({ error: `Could not read résumé: ${dl.error ?? "empty file"}` }, { status: 500 });
  const ab = dl.buffer.buffer.slice(dl.buffer.byteOffset, dl.buffer.byteOffset + dl.buffer.byteLength) as ArrayBuffer;

  // Watermarking and redaction only work on PDFs. A DOCX résumé used to throw,
  // get swallowed by the catch, and show "preview unavailable" — which looked
  // like the résumé simply would not open.
  const isPdf = dl.buffer.subarray(0, 4).toString("latin1").startsWith("%PDF");
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  // Released → they have engaged, so send the original.
  if (released) {
    if (!isPdf) {
      // Nothing to watermark, but they are entitled to the file.
      return new NextResponse(ab, {
        headers: { "Content-Type": DOCX_MIME, "Content-Disposition": "attachment; filename=resume.docx" }
      });
    }
    try {
      const stamped = await watermarkResumePdf(ab);
      return new NextResponse(Buffer.from(stamped), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=resume.pdf" }
      });
    } catch {
      return new NextResponse(ab, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=resume.pdf" }
      });
    }
  }

  // Not released → redact before showing. Only possible on PDFs.
  if (!isPdf) {
    return NextResponse.json({
      error: "This résumé is a Word document, which we can't redact for preview. Unlock the candidate to open the full file.",
      reason: "docx_no_preview"
    }, { status: 409 });
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
  } catch (e: any) {
    // Never leak the raw file — but say WHY, so a failure is diagnosable
    // rather than a dead end.
    return NextResponse.json({
      error: `We couldn't prepare a redacted preview of this résumé: ${e?.message ?? "unknown error"}. Unlock the candidate to open the original.`,
      reason: "redaction_failed"
    }, { status: 409 });
  }
}
