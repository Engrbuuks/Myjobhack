import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";
import { getPricing } from "@/lib/pricing";

export const runtime = "nodejs";
const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "recruiter", "employer"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { job_id, talent_ids } = await request.json();
  const ids: string[] = Array.isArray(talent_ids) ? talent_ids.filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "Select at least one candidate to assess." }, { status: 400 });

  const pricing = await getPricing();
  const amount = ids.length * pricing.assessment_per_candidate_ngn;

  const { data: order, error } = await admin.from("assessment_orders").insert({
    employer_id: user.id, job_id: job_id ?? null, talent_ids: ids,
    amount, currency: "NGN", status: "pending"
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the team to collect payment / fulfil (kept manual like your other billing).
  await sendEmail("hello@myjobhack.co", `Assessment order — ${ids.length} candidate(s)`, renderEmail({
    kicker: "New assessment order",
    heading: `${ids.length} candidate assessment(s) requested`,
    paragraphs: [`An employer ordered role-specific assessments. Total ₦${amount.toLocaleString()}.`],
    details: [["Candidates", String(ids.length)], ["Amount", `₦${amount.toLocaleString()}`], ["Order", order.id]],
    cta: { label: "Open admin", url: `${APP()}/portal/admin` }
  }));

  return NextResponse.json({
    ok: true, order_id: order.id, amount,
    message: `Order created — ₦${amount.toLocaleString()} for ${ids.length} assessment(s). Transfer to activate; we'll assess the candidates and send you scored results.`
  });
}
