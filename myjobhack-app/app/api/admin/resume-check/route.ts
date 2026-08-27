import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Why won't this applicant's résumé open?
 * Reports where the file is meant to be and whether it can actually be read.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get("application_id");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  if (!applicationId) {
    // No ID given — summarise the whole picture instead.
    const { count: withGuest } = await admin.from("applications")
      .select("id", { count: "exact", head: true }).not("guest_resume_path", "is", null);
    const { count: withDoc } = await admin.from("applications")
      .select("id", { count: "exact", head: true }).not("resume_document_id", "is", null);
    const { count: withNone } = await admin.from("applications")
      .select("id", { count: "exact", head: true })
      .is("guest_resume_path", null).is("resume_document_id", null);
    return NextResponse.json({
      summary: { guest_resumes: withGuest ?? 0, member_resumes: withDoc ?? 0, no_resume: withNone ?? 0 },
      hint: "Add ?application_id=<id> to inspect one specific applicant."
    });
  }

  const { data: app } = await admin.from("applications")
    .select("id, talent_id, guest_name, guest_resume_path, guest_resume_bucket, guest_resume_provider, resume_document_id")
    .eq("id", applicationId).maybeSingle();
  if (!app) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  const report: any = {
    applicant: app.guest_name ?? "(member)",
    is_guest: !app.talent_id,
    has_guest_resume: !!app.guest_resume_path,
    has_document_resume: !!app.resume_document_id
  };

  let location: any = null;
  if (app.guest_resume_path) {
    location = {
      provider: app.guest_resume_provider === "r2" ? "r2" : "supabase",
      bucket: app.guest_resume_bucket || "guest-uploads",
      path: app.guest_resume_path
    };
  } else if (app.resume_document_id) {
    const { data: doc } = await admin.from("documents")
      .select("bucket, path, storage_provider, mime, original_name").eq("id", app.resume_document_id).maybeSingle();
    if (doc) {
      const { locationFromDocument } = await import("@/lib/storage");
      location = locationFromDocument(doc as any);
      report.file_name = doc.original_name;
      report.mime = doc.mime;
    }
  }

  if (!location) {
    report.verdict = "No résumé attached to this application at all.";
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  }

  report.location = location;

  // Actually try to read it — that is the only real test.
  const { downloadFile } = await import("@/lib/storage");
  const dl = await downloadFile({ supabase: admin as any, location });
  report.readable = !!dl.buffer;
  report.bytes = dl.buffer?.length ?? 0;
  report.download_error = dl.error ?? null;

  report.verdict = dl.buffer
    ? `File found and readable — ${dl.buffer.length.toLocaleString()} bytes from ${location.provider}.`
    : `File could not be read from ${location.provider} bucket "${location.bucket}" at path "${location.path}": ${dl.error}`;

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
