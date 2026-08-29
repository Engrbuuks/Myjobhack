import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe. Public by necessity — the recipient has no account.
 *
 * Accepts POST both from the page and from mail clients honouring
 * List-Unsubscribe-Post, which fire it automatically with no body. The token
 * in the URL is therefore also accepted as a query parameter.
 *
 * Deliberately narrow: it can only ever set an opt-out flag. It reads nothing
 * back and reveals nothing, so a leaked token exposes no personal data.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({} as any));
  const token = body?.token ?? url.searchParams.get("token") ?? url.pathname.split("/").pop();
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("email_optouts")
    .update({ opted_out_at: new Date().toISOString() })
    .eq("token", token).is("opted_out_at", null);

  // Already opted out is success, not an error — mail clients may fire twice.
  if (error) return NextResponse.json({ error: "Could not process that." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
