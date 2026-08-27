import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deliverability check. Most Promotions/Spam problems are DNS, not wording —
 * this reports what is set and what is missing.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const from = process.env.RESEND_FROM || "MYJOBHACK <no-reply@myjobhack.co>";
  const domain = (from.match(/@([^>\s]+)/) || [])[1] ?? "myjobhack.co";

  const report: any = {
    from, reply_to: process.env.RESEND_REPLY_TO || "hello@myjobhack.co",
    sending_domain: domain,
    resend_key_set: !!process.env.RESEND_API_KEY,
    checked_at: new Date().toISOString(),
    dns: {} as Record<string, any>
  };

  // Resolve the records that decide whether you reach the inbox.
  const dns = await import("node:dns/promises");

  try {
    const txt = await dns.resolveTxt(domain);
    const flat = txt.map(r => r.join(""));
    const spf = flat.find(r => r.startsWith("v=spf1"));
    report.dns.spf = spf
      ? { present: true, value: spf, includes_resend: spf.includes("resend") || spf.includes("amazonses") }
      : { present: false, note: "No SPF record. Add one that authorises your sending provider." };
  } catch {
    report.dns.spf = { present: false, note: "Could not read TXT records for this domain." };
  }

  try {
    const dmarc = await dns.resolveTxt(`_dmarc.${domain}`);
    const val = dmarc.map(r => r.join("")).find(r => r.startsWith("v=DMARC1"));
    report.dns.dmarc = val
      ? { present: true, value: val }
      : { present: false, note: "No DMARC record. Gmail requires one for bulk senders." };
  } catch {
    report.dns.dmarc = { present: false, note: "No _dmarc record found. This is a major deliverability gap." };
  }

  // DKIM selector varies by provider; Resend uses 'resend'.
  try {
    const dkim = await dns.resolveTxt(`resend._domainkey.${domain}`);
    report.dns.dkim = { present: dkim.length > 0, selector: "resend" };
  } catch {
    report.dns.dkim = { present: false, note: "No DKIM record found at resend._domainkey. Verify your domain in Resend." };
  }

  const missing: string[] = [];
  if (!report.dns.spf?.present) missing.push("SPF");
  if (!report.dns.dkim?.present) missing.push("DKIM");
  if (!report.dns.dmarc?.present) missing.push("DMARC");

  // Verifying a domain with a sending provider usually sets SPF and DKIM.
  // DMARC is separate, and its absence is the most common reason a verified
  // domain still lands in Promotions.
  report.note_on_verification =
    "Verifying your domain with Resend typically adds SPF and DKIM. DMARC is a separate record you add yourself — a verified domain can still be missing it.";

  if (!missing.length) {
    report.verdict = "SPF, DKIM and DMARC are all present. Authentication is not your problem — remaining Promotions placement is down to content design, sending volume and reputation.";
  } else if (missing.length === 1 && missing[0] === "DMARC") {
    report.verdict = "SPF and DKIM are set, but DMARC is missing. Gmail requires DMARC from bulk senders — this alone is enough to route mail to Promotions. Add a TXT record at _dmarc." + domain + " with value: v=DMARC1; p=none; rua=mailto:dmarc@" + domain;
  } else {
    report.verdict = `Missing ${missing.join(", ")}. Until these exist, mail will keep landing in Promotions or Spam regardless of how it is written.`;
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
