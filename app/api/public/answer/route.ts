import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Record an applicant's one-click answer.
 * POST { token, value }
 *
 * Public by design — the applicant has no account. The token is the whole
 * credential, so this route is deliberately narrow: it can only write one
 * named field on one application, only to a value the question actually
 * offers, and only once. It never reads or returns anything about the
 * candidate, so a leaked token exposes nothing.
 */
export async function POST(request: Request) {
  const { token, value } = await request.json().catch(() => ({} as any));
  if (!token || typeof value !== "string")
    return NextResponse.json({ error: "Missing token or answer." }, { status: 400 });

  const admin = createAdminClient();
  const { data: req } = await admin.from("answer_requests")
    .select("id, application_id, field_id, options, answered_at")
    .eq("token", token).maybeSingle();

  if (!req) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });

  // Answering twice is a no-op rather than an error — people tap the email
  // button, then open the page again to check it worked.
  if (req.answered_at) return NextResponse.json({ ok: true, already: true });

  const options: string[] = Array.isArray(req.options) ? req.options : [];
  const match = options.find((o) => o.toLowerCase() === value.trim().toLowerCase());
  if (!match)
    return NextResponse.json({ error: "That isn't one of the available answers." }, { status: 400 });

  // Merge into the answers map rather than replacing it — this application
  // has other answers we must not lose.
  const { data: app } = await admin.from("applications")
    .select("answers").eq("id", req.application_id).maybeSingle();
  if (!app) return NextResponse.json({ error: "This application no longer exists." }, { status: 404 });

  const answers = { ...((app.answers as Record<string, any>) ?? {}), [req.field_id]: match };

  const { error: upErr } = await admin.from("applications")
    .update({ answers }).eq("id", req.application_id);
  if (upErr) return NextResponse.json({ error: "Could not save that. Please try again." }, { status: 500 });

  await admin.from("answer_requests")
    .update({ answered_at: new Date().toISOString(), answered_value: match })
    .eq("id", req.id);

  return NextResponse.json({ ok: true });
}
