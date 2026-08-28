import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText, extractTextFromPath } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Build the searchable CV index.
 * POST { limit?, reindex?, include_guests? }
 * GET  → coverage: how much of the pool is indexed.
 *
 * Extraction is slow — a download and a PDF parse per person — so this runs in
 * batches and reports what remains rather than timing out. It is designed to
 * be clicked repeatedly, or wired to a cron later.
 *
 * Once a CV is indexed, searching it is free. This cost is paid once per CV,
 * not once per search.
 */

async function gate() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { admin };
}

export async function GET() {
  const g = await gate(); if ("error" in g) return g.error;
  const admin = g.admin;

  const { count: withResume } = await admin.from("talent_profiles")
    .select("profile_id", { count: "exact", head: true }).not("resume_document_id", "is", null);
  const { count: indexed } = await admin.from("resume_index")
    .select("id", { count: "exact", head: true }).not("profile_id", "is", null);
  const { count: unreadable } = await admin.from("resume_index")
    .select("id", { count: "exact", head: true }).eq("unreadable", true);
  const { count: guestsIndexed } = await admin.from("resume_index")
    .select("id", { count: "exact", head: true }).not("application_id", "is", null);

  return NextResponse.json({
    pool_with_resume: withResume ?? 0,
    indexed: indexed ?? 0,
    remaining: Math.max(0, (withResume ?? 0) - (indexed ?? 0)),
    unreadable: unreadable ?? 0,
    guest_applications_indexed: guestsIndexed ?? 0
  });
}

export async function POST(request: Request) {
  const g = await gate(); if ("error" in g) return g.error;
  const admin = g.admin;

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit) || 25, 50);
  const reindex = !!body.reindex;
  const includeGuests = !!body.include_guests;

  // Who still needs indexing?
  const { data: alreadyRows } = await admin.from("resume_index")
    .select("profile_id").not("profile_id", "is", null);
  const already = new Set((alreadyRows ?? []).map((r: any) => r.profile_id));

  const { data: pool } = await admin.from("talent_profiles")
    .select("profile_id, resume_document_id")
    .not("resume_document_id", "is", null)
    .limit(reindex ? limit : 800);

  const queue = (pool ?? [])
    .filter((p: any) => reindex || !already.has(p.profile_id))
    .slice(0, limit);

  let indexed = 0, unreadable = 0;
  const errors: string[] = [];

  for (const person of queue) {
    const r = await extractDocumentText(admin as any, person.resume_document_id);
    const text = (r.text ?? "").trim();
    if (r.error) errors.push(r.error);

    const isUnreadable = text.length < 40;
    if (isUnreadable) unreadable++;

    await admin.from("resume_index").upsert({
      profile_id: person.profile_id,
      document_id: person.resume_document_id,
      // Collapse whitespace: PDF extraction produces ragged line breaks that
      // would otherwise split phrases like "Spanish (fluent)" across lines.
      content: text.replace(/\s+/g, " ").slice(0, 200_000),
      content_chars: text.length,
      unreadable: isUnreadable,
      extract_error: r.error ?? null,
      indexed_at: new Date().toISOString()
    }, { onConflict: "profile_id" });
    indexed++;
  }

  // Guest applicants have no pool profile but did submit a CV. Worth indexing
  // when you want the widest possible net.
  let guestIndexed = 0;
  if (includeGuests && indexed < limit) {
    const { data: guestApps } = await admin.from("applications")
      .select("id, guest_resume_path, guest_resume_bucket, guest_resume_provider")
      .is("talent_id", null).not("guest_resume_path", "is", null)
      .limit(limit - indexed);

    const { data: gIdx } = await admin.from("resume_index")
      .select("application_id").not("application_id", "is", null);
    const gDone = new Set((gIdx ?? []).map((r: any) => r.application_id));

    for (const app of (guestApps ?? []).filter((a: any) => reindex || !gDone.has(a.id))) {
      const r = await extractTextFromPath(
        admin as any,
        app.guest_resume_provider === "r2"
          ? (process.env.R2_BUCKET || "myjobhack")
          : (app.guest_resume_bucket || "guest-uploads"),
        app.guest_resume_path
      );
      const text = (r.text ?? "").trim();
      await admin.from("resume_index").upsert({
        application_id: app.id,
        content: text.replace(/\s+/g, " ").slice(0, 200_000),
        content_chars: text.length,
        unreadable: text.length < 40,
        extract_error: r.error ?? null,
        indexed_at: new Date().toISOString()
      }, { onConflict: "application_id" });
      guestIndexed++;
      if (text.length < 40) unreadable++;
    }
  }

  const { count: poolTotal } = await admin.from("talent_profiles")
    .select("profile_id", { count: "exact", head: true }).not("resume_document_id", "is", null);
  const { count: nowIndexed } = await admin.from("resume_index")
    .select("id", { count: "exact", head: true }).not("profile_id", "is", null);
  const remaining = Math.max(0, (poolTotal ?? 0) - (nowIndexed ?? 0));

  return NextResponse.json({
    message: `Indexed ${indexed} CV${indexed === 1 ? "" : "s"}` +
      (guestIndexed ? ` and ${guestIndexed} guest application${guestIndexed === 1 ? "" : "s"}` : "") +
      (unreadable ? ` · ${unreadable} had no readable text (likely photographed)` : "") +
      (remaining ? ` · ${remaining} left to index` : " · the pool is fully indexed."),
    indexed, guest_indexed: guestIndexed, unreadable, remaining,
    sample_errors: Array.from(new Set(errors)).slice(0, 3)
  });
}
