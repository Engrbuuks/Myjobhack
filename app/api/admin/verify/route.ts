import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin" && me?.role !== "recruiter")
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { type, id, action, chapter_id, notes } = await request.json();
  if (!["credential", "elite"].includes(type) || !["verify", "reject"].includes(action) || !id)
    return NextResponse.json({ error: "type, id, action required" }, { status: 400 });

  const admin = createAdminClient();
  const status = action === "verify" ? "verified" : "rejected";

  if (type === "credential") {
    const { data: cred } = await admin.from("credentials").select("talent_id, title, institution").eq("id", id).single();
    if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await admin.from("credentials").update({
      status: status as any, reviewer_id: user.id, reviewer_notes: notes ?? null,
      reviewed_at: new Date().toISOString()
    }).eq("id", id);
    if (action === "verify") {
      await admin.from("talent_profiles").update({ verification: "verified" }).eq("profile_id", cred.talent_id);
    }
    const { data: cProf } = await admin.from("profiles").select("email, full_name").eq("id", cred.talent_id).single();
    if (action === "verify" && cProf?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
      await sendEmail(cProf.email, "Your credential is verified ✓", renderEmail({
        kicker: "Verification complete",
        heading: "Verified — employers will know.",
        paragraphs: [
          `Hi ${(cProf.full_name || "there").split(" ")[0]} — ${cred.title || "your credential"} from ${cred.institution} has been verified by our team.`,
          "Your profile now carries verified status, which puts you ahead in matching and in front of employers."
        ],
        cta: { label: "View your profile", url: `${appUrl}/portal/seeker/profile` }
      }));
    }
    await admin.from("notifications").insert({
      profile_id: cred.talent_id,
      title: action === "verify" ? "Credential verified ✓" : "Credential review update",
      body: action === "verify"
        ? `${cred.title || "Your credential"} from ${cred.institution} is verified. Your profile now carries verified status.`
        : `We couldn't verify ${cred.title || "your credential"}. ${notes ?? "Contact the team for details."}`,
      link: "/portal/seeker/profile"
    });
  } else {
    const { data: em } = await admin.from("elite_memberships").select("talent_id, distinction").eq("id", id).single();
    if (!em) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await admin.from("elite_memberships").update({
      status: status as any, reviewer_id: user.id,
      chapter_id: chapter_id ?? undefined,
      verified_at: action === "verify" ? new Date().toISOString() : null
    }).eq("id", id);

    if (action === "verify") {
      // the transformation: role flips, portal changes on next load
      await admin.from("profiles").update({ role: "elite_member" }).eq("id", em.talent_id);
      await admin.from("talent_profiles").update({ verification: "verified" }).eq("profile_id", em.talent_id);
      await admin.from("notifications").insert({
        profile_id: em.talent_id, title: "Welcome to the room 🎉",
        body: "Your Elite membership is verified. Your member card, chapter, and the continental network are waiting.",
        link: "/portal/elite"
      });
      const { data: eProf } = await admin.from("profiles").select("email, full_name").eq("id", em.talent_id).single();
      const { data: mem } = await admin.from("elite_memberships").select("member_no").eq("id", id).single();
      if (eProf?.email) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
        await sendEmail(eProf.email, "Welcome to the room — you're Elite ✦", renderEmail({
          preheader: "Your membership is verified. Your member card is waiting.",
          kicker: "Myjobhack Elite · verified",
          heading: "Welcome to the room.",
          paragraphs: [
            `${(eProf.full_name || "").split(" ")[0]}, your credentials are verified — you're now a member of Africa's community of first class minds.`,
            "Your digital member card, your city chapter, and the continental network are live in your portal. Priority matching starts now."
          ],
          details: [["Member", `№ ${String(mem?.member_no ?? "").padStart(4, "0")}`], ["Distinction", em.distinction ?? "Verified"]],
          cta: { label: "See your member card", url: `${appUrl}/portal/elite` }
        }));
      }
    } else {
      await admin.from("notifications").insert({
        profile_id: em.talent_id, title: "Elite application update",
        body: notes ?? "Your Elite application wasn't approved this time.",
        link: "/portal/seeker/elite"
      });
    }
  }

  await admin.from("activity_log").insert({
    actor_id: user.id, action: `${type} ${status}`, entity: type, entity_id: id, meta: { notes }
  });
  return NextResponse.json({ ok: true });
}
