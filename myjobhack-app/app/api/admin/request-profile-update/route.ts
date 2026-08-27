import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const body = await request.json();
  const reason: string = body.reason || "keep your profile current";

  // Either an explicit list, or "all talent" when select_all is true.
  let ids: string[] = Array.isArray(body.profile_ids) ? body.profile_ids : [];
  if (body.select_all) {
    const all = await (async () => {
      const out: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await admin.from("profiles")
          .select("id").in("role", ["job_seeker", "elite_member"]).range(from, from + 999);
        if (data?.length) out.push(...data.map((r: any) => r.id));
        if (!data || data.length < 1000) break;
      }
      return out;
    })();
    ids = all;
  }
  if (!ids.length) return NextResponse.json({ error: "No one selected." }, { status: 400 });

  const { data: people } = await admin.from("profiles").select("id, email, full_name").in("id", ids);

  let sent = 0; const failures: string[] = [];
  for (const p of people ?? []) {
    if (!p.email) { failures.push(p.full_name || p.id); continue; }
    const first = (p.full_name || "there").split(" ")[0];
    const html = renderEmail({
      kicker: "Your profile",
      heading: "Keep your profile up to date",
      paragraphs: [
        `Hi ${first}, we'd like you to review and update your MYJOBHACK profile so employers see your most current skills, location and experience.`,
        `A complete, current profile is far more likely to be matched — it only takes a couple of minutes.`
      ],
      bullets: ["Confirm your location and expertise", "Add anything new since you joined", "Make sure your resume is current"],
      cta: { label: "Update my profile", url: `${APP()}/portal/seeker/profile` }
    });
    const { error } = await sendEmail(p.email, "Please update your MYJOBHACK profile", html);
    if (error) { failures.push(p.email); continue; }
    await admin.from("profile_update_requests").insert({ profile_id: p.id, requested_by: user.id, reason });
    sent++;
  }

  return NextResponse.json({ ok: true, sent, failed: failures.length });
}
