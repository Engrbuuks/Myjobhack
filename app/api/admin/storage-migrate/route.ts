import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { r2Configured, uploadFile, downloadFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Status: how much is on each provider.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { count: onSupabase } = await admin.from("documents")
    .select("id", { count: "exact", head: true }).eq("storage_provider", "supabase");
  const { count: onR2 } = await admin.from("documents")
    .select("id", { count: "exact", head: true }).eq("storage_provider", "r2");
  const { count: guestsOnSupabase } = await admin.from("applications")
    .select("id", { count: "exact", head: true })
    .not("guest_resume_path", "is", null).eq("guest_resume_provider", "supabase");

  const { data: sizes } = await admin.from("upload_log").select("bytes, storage_provider");
  const bytesBy = (p: string) => (sizes ?? [])
    .filter((r: any) => r.storage_provider === p)
    .reduce((t: number, r: any) => t + Number(r.bytes || 0), 0);

  return NextResponse.json({
    r2_configured: r2Configured(),
    documents: { on_supabase: onSupabase ?? 0, on_r2: onR2 ?? 0 },
    guest_resumes_on_supabase: guestsOnSupabase ?? 0,
    approx_bytes: { supabase: bytesBy("supabase"), r2: bytesBy("r2") },
    verdict: !r2Configured()
      ? "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET, then new uploads will go to R2 automatically."
      : (onSupabase ?? 0) > 0
        ? `${onSupabase} documents are still on Supabase. POST to this endpoint to migrate them in batches.`
        : "Everything is on R2."
  }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Move a batch of files from Supabase to R2.
 *
 * Copies first, verifies, then flips the pointer — the Supabase original is
 * left in place so a failed migration never loses a file. Clean up only once
 * you are satisfied everything reads correctly from R2.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  if (!r2Configured())
    return NextResponse.json({ error: "R2 is not configured — nothing to migrate to." }, { status: 400 });

  const { limit } = await request.json().catch(() => ({ limit: 25 }));
  const batch = Math.min(Number(limit) || 25, 50);

  const { data: docs } = await admin.from("documents")
    .select("id, bucket, path, mime").eq("storage_provider", "supabase").limit(batch);

  if (!docs?.length)
    return NextResponse.json({ ok: true, moved: 0, message: "No documents left on Supabase." });

  let moved = 0, failed = 0;
  const errors: string[] = [];

  for (const d of docs) {
    const dl = await downloadFile({
      supabase: admin as any,
      location: { provider: "supabase", bucket: d.bucket || "documents", path: d.path }
    });
    if (dl.error || !dl.buffer) { failed++; errors.push(`${d.path}: ${dl.error}`); continue; }

    const up = await uploadFile({
      supabase: admin as any, path: d.path, body: dl.buffer, contentType: d.mime || undefined
    });
    if (up.error || up.location?.provider !== "r2") { failed++; errors.push(`${d.path}: ${up.error ?? "did not land on R2"}`); continue; }

    // Only now flip the pointer. The Supabase copy stays as a safety net.
    await admin.from("documents").update({ storage_provider: "r2" }).eq("id", d.id);
    moved++;
  }

  const { count: remaining } = await admin.from("documents")
    .select("id", { count: "exact", head: true }).eq("storage_provider", "supabase");

  return NextResponse.json({
    ok: true, moved, failed, remaining: remaining ?? 0,
    errors: errors.slice(0, 5),
    message: `Moved ${moved} file${moved === 1 ? "" : "s"} to R2.` +
      (failed ? ` ${failed} failed.` : "") +
      ((remaining ?? 0) > 0 ? ` ${remaining} still to go — run again.` : " Migration complete.")
  });
}
