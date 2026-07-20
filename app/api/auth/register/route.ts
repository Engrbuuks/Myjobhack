import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";

/**
 * Server-side registration that does NOT depend on Supabase Auth's SMTP.
 * We create the user with the admin API, generate a real confirmation link,
 * and deliver it through Resend (the same path campaign email already uses).
 */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const role = body.role === "employer" ? "employer" : "job_seeker";
  const ref = body.ref ? String(body.ref) : null;

  if (!fullName) return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });

  const admin = createAdminClient();
  const site = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

  // Create the user (unconfirmed). If they already exist, say so cleanly.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName, role, ...(ref ? { ref } : {}) }
  });

  if (createErr) {
    const msg = /already/i.test(createErr.message)
      ? "An account with this email already exists. Try signing in instead."
      : createErr.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Generate a real confirmation link tied to this user.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo: `${site}/auth/callback` }
  });

  if (linkErr || !linkData?.properties?.action_link) {
    // The account exists; they can still use "resend confirmation" later.
    return NextResponse.json({
      ok: true,
      warning: "Account created, but the confirmation email could not be generated. You can request a new link from the sign-in page."
    });
  }

  const confirmUrl = linkData.properties.action_link;

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 28px;color:#0C0D11">
    <div style="font-size:22px;font-weight:700;margin-bottom:4px">my<span style="color:#FC5647">job</span>hack</div>
    <p style="color:#6B6E7B;font-size:13px;margin:0 0 28px">Verified excellence. Real opportunities.</p>
    <h1 style="font-size:24px;line-height:1.3;margin:0 0 14px">You're almost in, ${fullName.split(" ")[0] || "there"}.</h1>
    <p style="font-size:15px;line-height:1.65;color:#3A3D46;margin:0 0 26px">
      Confirm your email to activate your profile and let verified employers find you.
    </p>
    <a href="${confirmUrl}" style="display:inline-block;background:#FC5647;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 30px;border-radius:999px">
      Confirm my email &rarr;
    </a>
    <p style="font-size:13px;line-height:1.6;color:#9A9CA6;margin:28px 0 0">
      If the button doesn't work, paste this link into your browser:<br>
      <a href="${confirmUrl}" style="color:#FC5647;word-break:break-all">${confirmUrl}</a>
    </p>
    <p style="font-size:12px;color:#B4B6BE;margin:28px 0 0">
      Didn't create this account? You can safely ignore this email.
    </p>
  </div>`;

  const { error: mailErr } = await sendEmail(email, "Confirm your email — MYJOBHACK", html);

  if (mailErr) {
    return NextResponse.json({
      ok: true,
      warning: "Your account was created, but we couldn't send the confirmation email just now. Request a new link from the sign-in page."
    });
  }

  return NextResponse.json({ ok: true });
}
