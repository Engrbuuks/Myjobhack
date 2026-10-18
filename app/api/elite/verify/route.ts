import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit, tooMany, LIMITS } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Check a member's credential. Open to anyone, which is the whole point.
 *
 * POST { code }
 *
 * This is the only authority the credential letter claims. An employer who
 * receives the letter loads this and sees the live status, so a membership
 * that has lapsed or been withdrawn cannot be evidenced by an old PDF.
 *
 * THREE THINGS THIS ROUTE IS CAREFUL ABOUT.
 *
 * 1 · It answers the same way whether a code is wrong or simply not valid.
 *     A different message for "no such code" and "code belongs to a lapsed
 *     member" would turn this into a way of mining which codes exist.
 *
 * 2 · It is rate limited by address. A short code is guessable given enough
 *     attempts, and without a limit this would be an oracle for walking the
 *     entire membership.
 *
 * 3 · It returns only what a credential check needs: the name, the
 *     distinction, the institution, the class and the member number. Never
 *     the email, the phone, the CV, the chapter peers or the reviewer.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(clientIp(request), LIMITS.verify_ip);
  if (!limit.ok)
    return tooMany(
      "Too many verification attempts from this network. Try again in an hour.",
      limit.retryAfterSeconds
    );

  const body = await request.json().catch(() => ({} as any));
  const raw = typeof body.code === "string" ? body.code : "";
  // Codes are issued upper case and hex, so anything else is not a code.
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
  if (code.length < 6)
    return NextResponse.json({ error: "Enter the verification code from the letter." }, { status: 400 });

  const admin = createAdminClient();

  // Codes live in elite_secrets, which no signed in user can read. One hop,
  // then the membership itself.
  const { data: secret } = await admin.from("elite_secrets")
    .select("talent_id").eq("verify_code", code).maybeSingle();

  const { data: m } = secret
    ? await admin.from("elite_memberships")
        .select("talent_id, member_no, distinction, class_year, status, verified_at, chapter_id, public_institution")
        .eq("talent_id", secret.talent_id).maybeSingle()
    : { data: null as any };

  /**
   * One answer for every failure.
   *
   * A withdrawn member and a typo both land here, and the response is
   * identical. Telling the caller which one it was leaks the existence of a
   * membership to someone who has not been given the code.
   */
  const noMatch = NextResponse.json({
    valid: false,
    message: "No current MYJOBHACK Elite membership matches that code."
  });

  if (!m || m.status !== "verified") return noMatch;

  const [{ data: profile }, { data: chapter }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", m.talent_id).maybeSingle(),
    m.chapter_id
      ? admin.from("chapters").select("city, country").eq("id", m.chapter_id).maybeSingle()
      : Promise.resolve({ data: null as any })
  ]);

  // The institution shown here is the one recorded on the verified
  // credential, not anything the member typed afterwards.
  const { data: cred } = await admin.from("credentials")
    .select("institution, title, year, distinction, status")
    .eq("talent_id", m.talent_id)
    .eq("status", "verified")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    valid: true,
    member: {
      name: profile?.full_name ?? "Member",
      member_no: m.member_no,
      distinction: cred?.distinction ?? m.distinction ?? null,
      institution: cred?.institution ?? m.public_institution ?? null,
      course: cred?.title ?? null,
      graduation_year: cred?.year ?? null,
      chapter: chapter ? `${chapter.city}, ${chapter.country}` : null,
      class_year: m.class_year ?? null,
      verified_at: m.verified_at ?? null
    },
    message: "This membership is current. The credential behind it was examined by MYJOBHACK."
  });
}
