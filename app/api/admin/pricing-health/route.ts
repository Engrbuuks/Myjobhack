import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proves whether pricing can actually be written. Performs a real round-trip:
 * writes a harmless probe value, reads it back, then removes it.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const report: any = {
    service_role_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    checked_at: new Date().toISOString()
  };
  if (!report.service_role_key_set) {
    report.verdict = "SUPABASE_SERVICE_ROLE_KEY is not set. Pricing cannot be saved until it is added to the hosting environment.";
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  }

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  // Real write → read → cleanup on the same row the Pricing screen uses.
  const probe = `probe_${Date.now()}`;
  const { data: before } = await admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle();
  const base = (before?.value ?? {}) as Record<string, any>;

  const { error: wErr } = await admin.from("app_settings")
    .upsert({ key: "pricing", value: { ...base, __probe: probe } }, { onConflict: "key" });

  if (wErr) {
    report.can_write = false;
    report.error = wErr.message;
    report.verdict = "The database rejected the write. Run migration 0036, which fixes the policies blocking pricing saves.";
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: after } = await admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle();
  const stored = (after?.value ?? {}) as Record<string, any>;
  report.can_write = stored.__probe === probe;

  // Clean the probe back out, whatever happened.
  const { __probe, ...clean } = stored;
  await admin.from("app_settings").upsert({ key: "pricing", value: clean }, { onConflict: "key" });

  report.current_pricing = clean;
  report.verdict = report.can_write
    ? "Pricing writes are working. Edits on Admin → Pricing will save."
    : "The write was accepted but did not persist — a policy is silently blocking it. Run migration 0036.";

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
