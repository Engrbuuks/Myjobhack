import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirms the live payment wiring: is the Paystack key set, does it
 * authenticate, and is the webhook URL what it should be.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const key = process.env.PAYSTACK_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const report: any = {
    key_set: !!key,
    key_mode: key ? (key.startsWith("sk_live") ? "LIVE" : key.startsWith("sk_test") ? "TEST" : "unknown") : null,
    webhook_url: `${appUrl}/api/pay/paystack/webhook`,
    checked_at: new Date().toISOString()
  };

  if (!key) {
    report.verdict = "Paystack key is NOT set. Add PAYSTACK_SECRET_KEY in your hosting environment — payments will not run without it.";
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  }

  // Ping Paystack to confirm the key authenticates.
  try {
    const res = await fetch("https://api.paystack.co/transaction?perPage=1", {
      headers: { Authorization: `Bearer ${key}` }
    });
    const json = await res.json();
    report.paystack_reachable = res.ok;
    report.paystack_message = json?.message ?? null;
    report.verdict = res.ok
      ? `Paystack is connected (${report.key_mode} mode). Ensure the webhook URL above is saved in your Paystack dashboard.`
      : "Key is set but Paystack rejected it — check the key is correct and active.";
  } catch (e: any) {
    report.paystack_reachable = false;
    report.verdict = `Could not reach Paystack: ${e?.message ?? "network error"}`;
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
