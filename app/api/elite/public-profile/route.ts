import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Turn the public member page on or off, and choose what it says.
 *
 * POST { enabled, headline, institution }
 *
 * OFF BY DEFAULT, and that is the important decision in this file. A verified
 * credential is the member's to publish, not ours, so nothing is public until
 * they say so here. Turning it off again takes the page down immediately,
 * because the page checks this flag on every render rather than being built
 * once.
 *
 * The member chooses the headline and the institution line. Everything else
 * on that page comes from the verified record and cannot be edited, which is
 * the only reason the page is worth anything to the person reading it.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({} as any));
  const admin = createAdminClient();

  const { data: m } = await admin.from("elite_memberships")
    .select("id, status, public_slug").eq("talent_id", user.id).maybeSingle();

  if (!m || m.status !== "verified")
    return NextResponse.json({
      error: "A public page is available once your membership is verified."
    }, { status: 403 });

  const patch: Record<string, any> = {};

  if (typeof body.enabled === "boolean") patch.public_profile = body.enabled;

  /**
   * Free text, trimmed and capped. It is shown on a page anybody can open, so
   * it is length limited to stop the page being used as a billboard, and it
   * is stored as typed rather than rendered as markup anywhere.
   */
  if (typeof body.headline === "string")
    patch.public_headline = body.headline.replace(/\s+/g, " ").trim().slice(0, 120) || null;
  if (typeof body.institution === "string")
    patch.public_institution = body.institution.replace(/\s+/g, " ").trim().slice(0, 120) || null;

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await admin.from("elite_memberships").update(patch).eq("id", m.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: after } = await admin.from("elite_memberships")
    .select("public_profile, public_slug, public_headline, public_institution")
    .eq("id", m.id).maybeSingle();

  return NextResponse.json({
    ok: true,
    public_profile: !!after?.public_profile,
    url: after?.public_slug ? `${APP()}/e/${after.public_slug}` : null,
    headline: after?.public_headline ?? null,
    institution: after?.public_institution ?? null,
    message: after?.public_profile
      ? "Your page is live. Anyone with the link can see your verified credential."
      : "Your page is off. The link now returns nothing."
  });
}
