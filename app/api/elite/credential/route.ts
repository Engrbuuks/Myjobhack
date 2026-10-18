import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCredentialLetter } from "@/lib/credentialLetter";

export const runtime = "nodejs";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * The member's own credential letter, as a PDF.
 *
 * GET, and only ever for the caller's own membership. There is no id
 * parameter on purpose: a route that took one would be a way to generate a
 * letter in somebody else's name, and a letter is exactly the sort of thing
 * that gets forwarded without being checked.
 *
 * Refused unless the membership is verified. A pending application has
 * nothing to attest to, and issuing paper for one would make the whole
 * document worthless.
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: m } = await admin.from("elite_memberships")
    .select("member_no, distinction, class_year, status, chapter_id")
    .eq("talent_id", user.id).maybeSingle();

  // The code is in elite_secrets, reachable only with the service role.
  const { data: secret } = await admin.from("elite_secrets")
    .select("verify_code").eq("talent_id", user.id).maybeSingle();

  if (!m || m.status !== "verified")
    return NextResponse.json({
      error: "A credential letter is issued once your membership is verified."
    }, { status: 403 });

  if (!secret?.verify_code || m.member_no == null)
    return NextResponse.json({
      error: "Your membership record is missing its verification code. Migration 0064 assigns one; tell the team if you see this."
    }, { status: 500 });

  const [{ data: profile }, { data: chapter }, { data: cred }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    m.chapter_id
      ? admin.from("chapters").select("city, country").eq("id", m.chapter_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
    admin.from("credentials")
      .select("institution, title, year, distinction, status")
      .eq("talent_id", user.id).eq("status", "verified")
      .order("year", { ascending: false }).limit(1).maybeSingle()
  ]);

  /**
   * The signatory is the platform, not whichever administrator happened to
   * approve the application. Naming a person who has since left would make
   * the letter unanswerable.
   */
  const bytes = await buildCredentialLetter({
    fullName: profile?.full_name ?? "Member",
    memberNo: m.member_no,
    distinction: cred?.distinction ?? m.distinction ?? null,
    institution: cred?.institution ?? null,
    course: cred?.title ?? null,
    graduationYear: cred?.year ?? null,
    chapter: chapter ? `${chapter.city}, ${chapter.country}` : null,
    classYear: m.class_year ?? null,
    verifyUrl: `${APP()}/verify`,
    verifyCode: secret.verify_code,
    signatory: "Membership Verification",
    signatoryTitle: "MYJOBHACK Elite"
  });

  const safeName = (profile?.full_name ?? "member").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="MYJOBHACK_Elite_${safeName}.pdf"`,
      // Never cached by a proxy: it carries a verification code.
      "Cache-Control": "private, no-store"
    }
  });
}
