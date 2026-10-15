import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactResumePdf, watermarkResumePdf, RedactionError } from "@/lib/redactResume";
import { requirePermission } from "@/lib/permissions.server";

export const runtime = "nodejs";

/**
 * Rasterising a CV is CPU bound and runs inside the request, so the function
 * needs more than the 10 second default. lib/redactResume.ts stops itself
 * well before this, which keeps the refusal ours rather than the platform's.
 */
export const maxDuration = 60;

/**
 * Serves a résumé to an employer with contact details redacted — UNLESS
 * the employer has unlocked the candidate or recorded a placement, in which
 * case the original is returned. Applicant résumés never go out raw pre-unlock.
 * GET /api/employer/resume?application_id=... (or ?talent_id=...)
 *
 * THE RULE THIS ROUTE ENFORCES, in order:
 *
 * 1. Authority. Staff are authorised by role and capability. An employer is
 *    authorised by MEMBERSHIP of the organisation that owns the job, or, for
 *    a pool link with no application behind it, by holding an unlock on that
 *    candidate. Role alone used to be the whole check, which meant any
 *    employer account plus any application id read any company's applicants.
 *
 * 2. Release. Whether the raw file goes out is decided from the talent of the
 *    application being asked for, never from a query parameter.
 *
 * 3. Redaction. If we cannot prove the contact details are gone, nobody sees
 *    the file. Every failure returns JSON, never the original document.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("application_id");
  const talentIdQ = searchParams.get("talent_id");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, permissions").eq("id", user.id).single();
  const isStaff = ["admin", "recruiter"].includes(me?.role ?? "");
  const isEmployer = me?.role === "employer";
  if (!isStaff && !isEmployer) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  /**
   * Staff access to CVs is graded. A coordinator can be given applicants
   * without being given the documents behind them, and hiding the link is not
   * a check — the request can still be made by hand.
   */
  if (isStaff) {
    const gate = await requirePermission("applicants.resume");
    if (!gate.ok) return gate.response;
  }

  if (!applicationId && !talentIdQ)
    return NextResponse.json({ error: "application_id or talent_id is required." }, { status: 400 });

  // Resolve the résumé path + the talent it belongs to.
  // Résumés live in one of three places: a guest upload bucket, the documents
  // bucket, or R2. Resolving this wrongly returned an empty response with no
  // error, which looked like "the résumé won't open".
  let location: { provider: "r2" | "supabase"; bucket: string; path: string } | null = null;

  /**
   * The talent whose unlock governs this file. Resolved from the application
   * itself and NEVER from the request.
   *
   * WHAT THIS CLOSES: the old line was `talentId = app?.talent_id ?? talentId`.
   * A guest application has talent_id NULL, so it fell back to the attacker
   * supplied ?talent_id= while still reading the guest's own file. Unlock one
   * candidate, then pass any guest application id together with that unlocked
   * talent id, and the guest's unredacted CV came out. A null here means no
   * unlock on earth releases this file.
   */
  let releaseTalentId: string | null = null;
  let isGuestApplication = false;

  if (applicationId) {
    const { data: app } = await admin.from("applications")
      .select("talent_id, job_id, resume_document_id, guest_resume_path, guest_resume_bucket, guest_resume_provider")
      .eq("id", applicationId).maybeSingle();
    if (!app) return NextResponse.json({ error: "That application no longer exists." }, { status: 404 });

    // Authority check: an employer must own the job this application is for.
    // Pattern follows app/api/employer/application-status/route.ts.
    if (!isStaff) {
      const { data: job } = await admin.from("jobs").select("org_id").eq("id", app.job_id).maybeSingle();
      if (!job) return NextResponse.json({ error: "That job no longer exists." }, { status: 404 });
      if (!job.org_id)
        return NextResponse.json({ error: "This job belongs to MYJOBHACK, so only staff can open its applicants' CVs." }, { status: 403 });
      const { data: membership } = await admin.from("org_members")
        .select("org_id").eq("org_id", job.org_id).eq("profile_id", user.id).maybeSingle();
      if (!membership)
        return NextResponse.json({ error: "This application belongs to another organisation." }, { status: 403 });
    }

    releaseTalentId = app.talent_id ?? null;
    isGuestApplication = !app.talent_id;

    if (app.guest_resume_path) {
      location = {
        provider: (app.guest_resume_provider === "r2" ? "r2" : "supabase"),
        bucket: app.guest_resume_bucket || "guest-uploads",
        path: app.guest_resume_path
      };
    } else if (app.resume_document_id) {
      const { data: doc } = await admin.from("documents")
        .select("bucket, path, storage_provider").eq("id", app.resume_document_id).maybeSingle();
      if (doc) {
        const { locationFromDocument } = await import("@/lib/storage");
        location = locationFromDocument(doc as any);
      }
    }
  } else if (talentIdQ) {
    /**
     * Pool and shortlist links carry only a talent id, so there is no job and
     * no organisation to resolve authority from. For an employer the only
     * standing they can have over a bare candidate is a paid unlock or a
     * recorded placement, which is checked below before anything is read.
     */
    releaseTalentId = talentIdQ;

    // Fall back to the talent's profile résumé.
    const { data: tp } = await admin.from("talent_profiles")
      .select("resume_document_id").eq("profile_id", talentIdQ).maybeSingle();
    if (tp?.resume_document_id) {
      const { data: doc } = await admin.from("documents")
        .select("bucket, path, storage_provider").eq("id", tp.resume_document_id).maybeSingle();
      if (doc) {
        const { locationFromDocument } = await import("@/lib/storage");
        location = locationFromDocument(doc as any);
      }
    }
  }

  // Has this employer earned the raw file? (unlock or recorded placement)
  let released = isStaff;
  if (isEmployer) {
    if (releaseTalentId) {
      const [{ data: unlock }, { data: placement }] = await Promise.all([
        admin.from("profile_unlocks").select("id").eq("employer_id", user.id).eq("talent_id", releaseTalentId).maybeSingle(),
        admin.from("placements").select("id").eq("employer_id", user.id).eq("talent_id", releaseTalentId).maybeSingle()
      ]);
      released = !!unlock || !!placement;
    } else {
      // A guest application has no profile to unlock, so it is never released.
      released = false;
    }

    // No application behind the request means the unlock IS the authority.
    if (!applicationId && !released)
      return NextResponse.json({
        error: "Unlock this candidate to open their CV.",
        reason: "not_unlocked"
      }, { status: 403 });
  }

  if (!location) return NextResponse.json({ error: "No résumé on file for this applicant." }, { status: 404 });

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
      // Only the watermark failed. The employer is entitled to these contact
      // details, so the unstamped original is the right fallback here. This is
      // the one place in this route where that is true.
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
    const { bytes, redactedCount, pageCount, rasterMs } = await redactResumePdf(ab);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=resume-redacted.pdf",
        // Diagnostics only. Nothing about whether the file is safe to show is
        // ever communicated in a header again: an unscrubbable page is a 409
        // with no bytes, because a warning string in a header is something no
        // browser displays and no employer ever saw.
        "X-Redaction-Items": String(redactedCount),
        "X-Redaction-Pages": String(pageCount),
        "X-Redaction-Ms": String(rasterMs)
      }
    });
  } catch (e: any) {
    /**
     * Fail closed, always.
     *
     * Every path to here means we could not prove the contact details are
     * gone: a scanned page with no text layer, a document past the page cap,
     * a rasterising timeout, or any unexpected throw. The original file is
     * never the fallback. Say WHY, so the failure is diagnosable rather than
     * a dead end.
     */
    const reason = e instanceof RedactionError ? e.reason : "redaction_failed";
    const detail = e?.message ?? "unknown error";
    const guidance = isGuestApplication
      ? "This applicant applied as a guest, so there is no profile to unlock. Ask them to upload a text based PDF."
      : "Unlock the candidate to open the original.";
    return NextResponse.json({
      error: `We couldn't prepare a protected preview of this résumé: ${detail} ${guidance}`,
      reason
    }, { status: 409 });
  }
}
