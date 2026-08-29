import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { extractDocumentText, extractTextFromPath } from "@/lib/extract";
import { scanText } from "@/lib/resumeScan";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Scan the résumés on a job for a keyword list.
 * POST { job_id, terms: ["Abeokuta","Ibadan"], limit?, rescan? }
 *
 * Results are written to applications.resume_signals — NOT to answers. A CV
 * mention is a hint for triage, not something the candidate told you, and
 * conflating the two would put unverified data in the record permanently.
 *
 * Extraction is the slow part (a PDF is downloaded and parsed per applicant),
 * so this runs in batches and reports what is left rather than timing out.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const perm = await requirePermission("applicants.view");
  if (!perm.ok) return perm.response;

  const body = await request.json().catch(() => ({}));
  const jobId = body.job_id as string | undefined;
  const terms = (body.terms as string[] | undefined)?.map((t) => String(t).trim()).filter(Boolean) ?? [];
  const limit = Math.min(Number(body.limit) || 25, 60);
  const rescan = !!body.rescan;

  if (!jobId) return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  if (!terms.length) return NextResponse.json({ error: "Give at least one keyword to look for." }, { status: 400 });
  if (terms.length > 20) return NextResponse.json({ error: "Twenty keywords at most per scan." }, { status: 400 });

  let query = admin.from("applications")
    .select("id, talent_id, resume_document_id, guest_resume_path, guest_resume_bucket, guest_resume_provider, resume_scanned_at")
    .eq("job_id", jobId);
  if (!rescan) query = query.is("resume_scanned_at", null);

  const { data: apps, error } = await query.limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!apps?.length) {
    return NextResponse.json({
      message: rescan ? "No applications on this job." : "Every résumé on this job has already been scanned. Tick rescan to run again.",
      scanned: 0, matched: 0, remaining: 0
    });
  }

  let scanned = 0, matched = 0, noResume = 0, unreadable = 0;
  const failures: string[] = [];

  for (const app of apps) {
    let text: string | null = null;

    if (app.resume_document_id) {
      const r = await extractDocumentText(admin as any, app.resume_document_id);
      text = r.text;
      if (r.error) failures.push(r.error);
    } else if (app.guest_resume_path) {
      // Guest résumés are not `documents` rows — read them by path. This is
      // the same helper the scorer uses, so a guest CV that scores can scan.
      const r = await extractTextFromPath(
        admin as any,
        app.guest_resume_provider === "r2"
          ? (process.env.R2_BUCKET || "myjobhack")
          : (app.guest_resume_bucket || "guest-uploads"),
        app.guest_resume_path
      );
      text = r.text;
      if (r.error) failures.push(r.error);
    } else {
      noResume++;
    }

    // A scanned-photo CV has no text layer, so it can never match. Mark it
    // done anyway — otherwise the same unreadable files are retried forever.
    if (!text || text.trim().length < 40) {
      if (app.resume_document_id || app.guest_resume_path) unreadable++;
      await admin.from("applications").update({
        resume_signals: { hits: [], top: null, ambiguous: false, scanned_chars: 0, unreadable: true },
        resume_scanned_at: new Date().toISOString()
      }).eq("id", app.id);
      scanned++;
      continue;
    }

    const signals = scanText(text, terms);
    if (signals.hits.length) matched++;

    await admin.from("applications").update({
      resume_signals: { ...signals, terms },
      resume_scanned_at: new Date().toISOString()
    }).eq("id", app.id);
    scanned++;
  }

  const { count: remaining } = await admin.from("applications")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId).is("resume_scanned_at", null);

  const notes: string[] = [];
  if (noResume) notes.push(`${noResume} had no résumé on file`);
  if (unreadable) notes.push(`${unreadable} could not be read (likely a scanned image)`);

  return NextResponse.json({
    message: `Scanned ${scanned} résumé${scanned === 1 ? "" : "s"} · ${matched} mentioned one of your keywords${
      notes.length ? ` · ${notes.join(", ")}` : ""}${
      remaining ? ` · ${remaining} still to scan` : ""}.`,
    scanned, matched, no_resume: noResume, unreadable, remaining: remaining ?? 0,
    sample_errors: Array.from(new Set(failures)).slice(0, 3)
  });
}
