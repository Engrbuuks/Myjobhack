import { NextResponse } from "next/server";

/**
 * The only thing allowed to start a scheduled run.
 *
 * WHAT THIS FIXES: all three cron routes used to accept a user agent
 * containing "vercel-cron" as an alternative to the bearer token, and skipped
 * the check altogether when CRON_SECRET was unset. A user agent is a string the
 * caller chooses, so anyone at all could fire the funnel run and send a day of
 * drip email to the whole seeker list, repeatedly. The header proved nothing
 * and is no longer consulted.
 *
 * It fails closed. An unset CRON_SECRET answers 503 rather than running:
 * a misconfigured deployment should look broken, because the alternative is a
 * deployment whose email sender and matching spend are open to the internet.
 * Vercel sends the Authorization header on a scheduled request when the project
 * has CRON_SECRET set, so a correctly configured deployment never sees the 503.
 *
 * Returns null when the caller is genuine, otherwise the response to return.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("[cron] refused a run because CRON_SECRET is not set in this environment");
    return NextResponse.json({
      ok: false,
      error: "CRON_SECRET is not set in this environment, so scheduled runs cannot be authenticated. Set it in the Vercel project settings and redeploy."
    }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  return null;
}
