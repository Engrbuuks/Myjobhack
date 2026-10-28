import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A rate limit the platform can actually enforce.
 *
 * WHY NOT A COUNTER IN MEMORY: this runs on Vercel, where consecutive requests
 * may be handled by different instances and instances are recycled constantly.
 * A Map in module scope therefore limits nothing, because a script spreading
 * its requests sees a fresh empty counter almost every time. The count has to
 * live where every instance can see it, which here is the database, behind
 * rate_limit_touch() from migration 0061.
 *
 * WHAT THIS IS FOR. The public endpoints had no limit of any kind. One script
 * could fill the applications table, drive the AI scoring budget, push
 * invented addresses into the marketing contacts, and drain the day's email
 * allowance in about ninety requests, after which offer letters, signup
 * confirmations and interview invitations all stopped sending with no warning.
 */

export type Limit = { bucket: string; max: number; windowSeconds: number };

/** The caller's address, as far as the platform can tell. */
export function clientIp(request: Request): string {
  /**
   * Headers the PLATFORM sets come first, because the one everybody reaches
   * for can be written by the caller.
   *
   * x-forwarded-for is a list that proxies append to, so its leftmost entry
   * is whatever the client sent. Reading that first meant one extra header
   * per request gave every request a fresh identity and the rate limit
   * counted nothing. Vercel sets x-vercel-forwarded-for and x-real-ip itself
   * and they cannot be spoofed from outside, so they are consulted first.
   *
   * If only x-forwarded-for is present, the LAST entry is the one the nearest
   * trusted proxy wrote, which is the closest thing to the truth available.
   */
  const platform = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("cf-connecting-ip");
  if (platform?.trim()) return platform.split(",").pop()!.trim();

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd?.trim()) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

/**
 * Record one hit and say whether it is allowed.
 *
 * FAILS OPEN, deliberately. If the limiter itself is broken, a real applicant
 * must still be able to apply for a job. A limiter that takes the site down
 * when it has a bad day is worse than the abuse it prevents, and the abuse is
 * visible in the logs either way.
 */
export async function rateLimit(
  subject: string,
  { bucket, max, windowSeconds }: Limit
): Promise<{ ok: boolean; hits: number; retryAfterSeconds: number }> {
  const who = String(subject ?? "").slice(0, 200) || "unknown";
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_touch", {
      p_bucket: bucket,
      p_subject: who,
      p_window_seconds: windowSeconds
    });
    if (error) {
      // A missing function means migration 0061 has not been run. Say so once
      // in the log rather than failing the request.
      console.error(`[rateLimit] ${bucket} could not be checked:`, error.message);
      return { ok: true, hits: 0, retryAfterSeconds: 0 };
    }
    const hits = Number(data) || 0;
    return { ok: hits <= max, hits, retryAfterSeconds: windowSeconds };
  } catch (e: any) {
    console.error(`[rateLimit] ${bucket} threw:`, e?.message ?? e);
    return { ok: true, hits: 0, retryAfterSeconds: 0 };
  }
}

/**
 * The limits, in one place so they can be read and argued about.
 *
 * Each is set well above what a real person does and well below what a script
 * needs to be worth running. A candidate applies to a handful of roles in an
 * evening; nobody applies to forty in an hour from one address.
 */
export const LIMITS = {
  apply_ip:        { bucket: "apply_ip",        max: 12, windowSeconds: 3600 },
  apply_email:     { bucket: "apply_email",     max: 8,  windowSeconds: 3600 },
  interest_ip:     { bucket: "interest_ip",     max: 6,  windowSeconds: 3600 },
  interest_email:  { bucket: "interest_email",  max: 3,  windowSeconds: 86_400 },
  register_ip:     { bucket: "register_ip",     max: 8,  windowSeconds: 3600 },
  answer_ip:       { bucket: "answer_ip",       max: 40, windowSeconds: 3600 },
  /**
   * Credential verification is open to the public and takes a short code, so
   * without a limit it is a way to walk the whole membership by guessing. An
   * employer checking the letters of a shortlist might do ten in a sitting.
   */
  verify_ip:       { bucket: "verify_ip",       max: 20, windowSeconds: 3600 },
  /** An invitation is a one at a time act, not a mail merge. */
  referral_user:   { bucket: "referral_user",   max: 10, windowSeconds: 86_400 },
  /**
   * A candidate downloading their own signed offer. A person does it once or
   * twice; anything near this is a script guessing at links.
   */
  offer_file_ip:   { bucket: "offer_file_ip",   max: 30, windowSeconds: 3600 }
} satisfies Record<string, Limit>;

/** A 429 with the plain reason, and the header a well behaved client reads. */
export function tooMany(message: string, retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds)
    }
  });
}
