import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { rateLimit, clientIp, LIMITS, tooMany } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Server-side registration that does NOT depend on Supabase Auth's SMTP.
 * We create the user with the admin API, generate a real confirmation link,
 * and deliver it through Resend (the same path campaign email already uses).
 */
export async function POST(request: Request) {
 try {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const role = body.role === "employer" ? "employer" : "job_seeker";
  const ref = body.ref ? String(body.ref) : null;

  if (!fullName) return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });

  /**
   * A real address, checked properly.
   *
   * `email.includes("@")` was the whole test, and the address then went into a
   * pattern match against stored applications. Underscore and percent are
   * legal in an email local part and are both wildcards in SQL LIKE, so an
   * address of "_da@gmail.com" matched many real applicants at once. The
   * pattern match is gone below, and the address is validated here as well,
   * because an address that cannot receive mail is useless to everyone.
   */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });

  // Six characters is two days of guessing. Twelve is the current floor for a
  // password that protects someone's CV and contact details.
  if (password.length < 12)
    return NextResponse.json({
      error: "Please use a password of at least 12 characters. A short phrase you will remember is stronger than a short word."
    }, { status: 400 });

  /**
   * Registration is now counted per connection.
   *
   * Even with the existence of an account no longer confirmed in the response,
   * an unlimited signup endpoint is a way to work through a list of addresses
   * and passwords. Eight attempts an hour is far more than a person needs.
   */
  const reg = await rateLimit(clientIp(request), LIMITS.register_ip);
  if (!reg.ok)
    return tooMany("Too many sign up attempts from this connection. Try again in an hour.", reg.retryAfterSeconds);

  const admin = createAdminClient();

  /**
   * The invite tier is resolved from the link, not claimed in the request.
   *
   * invite_as used to be read straight from the body, so anyone could post
   * invite_as "elite" and insert a pending Elite membership for themselves,
   * filling the staff verification queue with self nominations.
   */
  let inviteAs: string | null = null;
  if (ref) {
    const { data: link } = await admin.from("invite_links")
      .select("kind, active").eq("code", ref).maybeSingle();
    if (link?.active) inviteAs = String(link.kind);
  }
  const site = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

  // Create the user (unconfirmed). If they already exist, say so cleanly.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName, role, ...(ref ? { ref } : {}) }
  });

  if (createErr) {
    /**
     * An existing address is not confirmed back to the caller.
     *
     * "An account with this email already exists" turns this endpoint into a
     * way to test which addresses have accounts here, one request at a time,
     * and the answer is the first half of a credential stuffing run. The
     * person who really owns the address is told by email instead, where only
     * they can read it.
     */
    if (/already|registered|exists/i.test(createErr.message)) {
      await sendEmail(email, "Someone tried to register with your email — MYJOBHACK", `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 28px;color:#083E40">
        <div style="font-size:22px;font-weight:700;margin-bottom:24px">my<span style="color:#FC5647">job</span>hack</div>
        <p style="font-size:15px;line-height:1.65;color:#3A3D46">
          Someone just tried to create a MYJOBHACK account with this email address, and you already have one.
        </p>
        <p style="font-size:15px;line-height:1.65;color:#3A3D46">
          If that was you, sign in instead, or reset your password from the sign in page. If it was not you,
          there is nothing to do: no new account was created and nothing about your account has changed.
        </p>
      </div>`).catch(() => null);

      return NextResponse.json({
        ok: true,
        message: "Check your email to continue. If you already have an account, we have sent you a note about signing in."
      });
    }
    return NextResponse.json({ error: createErr.message }, { status: 400 });
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
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 28px;color:#083E40">
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

  /**
   * Guest applications are NOT claimed here.
   *
   * They are claimed in /auth/callback, once the confirmation link has been
   * followed, because that is the only moment we know the person controls the
   * address. Claiming at registration meant anyone could type a stranger's
   * email and take their applications, and since the claim set talent_id the
   * real owner could never get them back. See lib/claimGuestApplications.ts.
   */

  if (ref) {
    try {
      await admin.rpc("bump_invite_signup", { p_code: ref });
    } catch { /* non-fatal */ }
  }
  // Elite invite → flag the new profile so admin can verify distinction.
  if (inviteAs === "elite" && created?.user?.id) {
    try {
      await admin.from("elite_memberships").insert({
        talent_id: created.user.id, status: "pending", source: "invite_link"
      });
    } catch { /* table/columns may differ; non-fatal */ }
  }

  return NextResponse.json({ ok: true });
 } catch (e: any) {
   // The reason goes to the server log, not to the caller: a raw exception
   // message names tables, columns and sometimes values.
   console.error("register route crashed:", e);
   return NextResponse.json(
     { error: "Registration failed on the server. Please try again, and tell us if it keeps happening." },
     { status: 500 }
   );
 }
}
