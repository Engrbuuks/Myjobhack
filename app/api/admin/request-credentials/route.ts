import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Admin asks a talent (or a batch) to upload verification documents.
 * Sends a branded email with a direct link to the credentials uploader.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { profile_ids } = await request.json();
  const ids: string[] = Array.isArray(profile_ids) ? profile_ids : [profile_ids].filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "No talent selected" }, { status: 400 });

  const { data: people } = await admin
    .from("profiles").select("id, email, full_name").in("id", ids);

  let sent = 0;
  const failures: string[] = [];

  for (const p of people ?? []) {
    if (!p.email) { failures.push(p.full_name || p.id); continue; }
    const first = (p.full_name || "there").split(" ")[0];
    const html = renderEmail({
      kicker: "Verification",
      heading: "Add your credentials to get verified",
      paragraphs: [
        `Hi ${first}, we'd like to verify your profile so employers can trust it at a glance — verified talent gets seen first.`,
        "It takes two minutes: upload your degree, certificate, or professional membership, and our team reviews it."
      ],
      bullets: [
        "Upload a clear photo or PDF of each credential",
        "We review and mark your profile verified",
        "Verified profiles rank higher and stand out to employers"
      ],
      cta: { label: "Upload my credentials", url: `${APP()}/portal/seeker/credentials` }
    });

    const { error } = await sendEmail(p.email, "Action needed: verify your MYJOBHACK profile", html);
    if (error) { failures.push(p.email); continue; }

    // log the request so we don't spam and can track who was asked
    await admin.from("credential_requests").insert({
      profile_id: p.id, requested_by: user.id
    }).select().maybeSingle();
    sent++;
  }

  return NextResponse.json({ ok: true, sent, failed: failures.length, failures });
}
