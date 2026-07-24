import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 120;

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * One-off nudge to existing seekers who have a résumé on file but no work
 * history. These people finished their profile before the import feature
 * existed and fall outside every drip window, so nothing else will reach them.
 *
 * GET  = dry run, tells you how many qualify.
 * POST = actually send.
 */
async function findTargets() {
  const admin = createAdminClient();

  const { data: withResume } = await admin.from("talent_profiles")
    .select("profile_id").not("resume_document_id", "is", null);
  if (!withResume?.length) return [];

  const ids = withResume.map((t: any) => t.profile_id);

  // Exclude anyone who already has work history.
  const { data: haveExp } = await admin.from("work_experiences")
    .select("talent_id").in("talent_id", ids);
  const done = new Set((haveExp ?? []).map((e: any) => e.talent_id));

  const targets = ids.filter((id: string) => !done.has(id));
  if (!targets.length) return [];

  const { data: people } = await admin.from("profiles")
    .select("id, full_name, email").in("id", targets)
    .in("role", ["job_seeker", "elite_member"]);

  return (people ?? []).filter((p: any) => p.email);
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const targets = await findTargets();
  return NextResponse.json({
    qualifying: targets.length,
    note: targets.length
      ? `${targets.length} seeker(s) have a résumé on file but no work history. POST to this endpoint to email them.`
      : "Nobody qualifies — everyone with a résumé already has work history listed."
  });
}

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const targets = await findTargets();
  if (!targets.length) return NextResponse.json({ ok: true, sent: 0, message: "Nobody qualifies." });

  let sent = 0;
  for (const p of targets) {
    const first = (p.full_name || "there").split(" ")[0];
    const html = renderEmail({
      kicker: "One minute, real difference",
      heading: "We can fill in your work history from your CV",
      paragraphs: [
        `Hi ${first},`,
        "Employers on MYJOBHACK look at your profile before they ever open your CV — and right now yours has no roles listed on it.",
        "You've already uploaded a CV, so there's nothing to retype. We can read the roles straight out of it. You check them before anything is saved."
      ],
      bullets: [
        "Takes about a minute",
        "You review every entry before it's added",
        "A fuller profile means better job matches"
      ],
      cta: { label: "Import from my CV", url: `${APP()}/portal/seeker/experience` }
    });

    const res = await sendEmail(p.email, "We can fill in your work history from your CV", html, { bulk: true });
    if (!res.error) {
      sent++;
      await admin.from("notifications").insert({
        profile_id: p.id,
        title: "Fill your work history from your CV",
        body: "We can read your roles straight out of the CV you uploaded — you review before saving.",
        link: "/portal/seeker/experience"
      });
    }
  }

  return NextResponse.json({
    ok: true, sent, qualifying: targets.length,
    message: `${sent} of ${targets.length} nudged to import their work history.`
  });
}
