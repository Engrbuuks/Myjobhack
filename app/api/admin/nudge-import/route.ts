import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 120;

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * One-off nudge to EXISTING members who have a résumé but no work history.
 *
 * The drip step only catches people 5-8 days after signup, so anyone who
 * registered before this feature existed would never hear about it. This
 * reaches them regardless of when they joined.
 */
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: talents } = await admin.from("talent_profiles")
    .select("profile_id").not("resume_document_id", "is", null);
  const ids = (talents ?? []).map(t => t.profile_id);
  if (!ids.length) return NextResponse.json({ ok: true, sent: 0, message: "Nobody has a résumé on file yet." });

  const { data: exp } = await admin.from("work_experiences").select("talent_id").in("talent_id", ids);
  const haveExperience = new Set((exp ?? []).map((e: any) => e.talent_id));
  const targets = ids.filter(id => !haveExperience.has(id));

  if (!targets.length)
    return NextResponse.json({ ok: true, sent: 0, message: "Everyone with a résumé already has work history recorded." });

  let sent = 0;
  for (const id of targets) {
    const { data: p } = await admin.from("profiles").select("full_name, email").eq("id", id).maybeSingle();
    if (!p?.email) continue;
    const first = (p.full_name || "there").split(" ")[0];

    const html = renderEmail({
      kicker: "Two minutes",
      heading: `${first}, employers can't see your experience yet`,
      paragraphs: [
        "Employers on MYJOBHACK evaluate a structured profile rather than a CV attachment. Your résumé is on file, but your work history section is blank — so you're being judged on less than you've actually done.",
        "You don't need to retype anything. We can now read your roles straight out of the résumé you already uploaded. You just check they're right."
      ],
      bullets: [
        "Takes about two minutes",
        "You review every entry before it saves",
        "A fuller profile ranks higher when employers search the pool"
      ],
      cta: { label: "Import my experience", url: `${APP()}/portal/seeker/experience` }
    });

    const res = await sendEmail(p.email, "Employers can't see your experience yet", html, { bulk: true });
    if (!res.error) {
      await admin.from("notifications").insert({
        profile_id: id,
        title: "Import your experience from your résumé",
        body: "Your work history is empty. We can read it from the CV you already uploaded.",
        link: "/portal/seeker/experience"
      });
      sent++;
    }
  }

  return NextResponse.json({
    ok: true, sent, eligible: targets.length,
    message: `Nudged ${sent} member${sent === 1 ? "" : "s"} who have a résumé but no work history.`
  });
}
