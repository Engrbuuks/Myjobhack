import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const ua = request.headers.get("user-agent") ?? "";
  if (secret && !ua.includes("vercel-cron") && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const now = Date.now();
  const in3d = new Date(now + 3 * 864e5).toISOString();
  const in2d = new Date(now + 2 * 864e5).toISOString();
  let reminded = 0;

  // expiring in ~3 days → gentle renewal reminder (once, thanks to the 24h window)
  const { data: expiring } = await admin.from("subscriptions")
    .select("id, profile_id, current_period_end")
    .eq("status", "active").gte("current_period_end", in2d).lte("current_period_end", in3d);

  for (const sub of expiring ?? []) {
    const { data: prof } = await admin.from("profiles").select("email, full_name").eq("id", sub.profile_id).single();
    const ends = new Date(sub.current_period_end).toLocaleDateString("en-GB", { dateStyle: "long" });
    await admin.from("notifications").insert({
      profile_id: sub.profile_id, title: "Your Career Toolkit renews soon",
      body: `Your subscription runs until ${ends}. Renew to keep every tool unlocked.`,
      link: "/portal/seeker/subscription"
    });
    if (prof?.email) {
      await sendEmail(prof.email, "Your Career Toolkit — 3 days left", renderEmail({
        kicker: "Renewal reminder",
        heading: "Keep the toolkit working.",
        paragraphs: [
          `Hi ${(prof.full_name || "there").split(" ")[0]} — your subscription runs until ${ends}.`,
          "Renew before then and your access continues without a gap — resume reviews, interview prep, skills analysis, all of it."
        ],
        cta: { label: "Renew now", url: `${appUrl}/portal/seeker/subscription` }
      }));
      reminded++;
    }
  }

  // expired in the last day → mark + notify
  const dayAgo = new Date(now - 864e5).toISOString();
  const { data: lapsed } = await admin.from("subscriptions")
    .select("id, profile_id").eq("status", "active")
    .gte("current_period_end", dayAgo).lte("current_period_end", new Date(now).toISOString());
  for (const sub of lapsed ?? []) {
    await admin.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
    await admin.from("notifications").insert({
      profile_id: sub.profile_id, title: "Subscription ended",
      body: "Your Career Toolkit is paused. Renew any time — your history and profile are untouched.",
      link: "/portal/seeker/subscription"
    });
  }

  return NextResponse.json({ ok: true, reminded, lapsed: (lapsed ?? []).length });
}
