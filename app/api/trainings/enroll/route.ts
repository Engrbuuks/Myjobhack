import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Register for a FREE training.
 *
 * WHY THIS ROUTE EXISTS: registration used to be a browser side insert into
 * `enrollments`, allowed by a row level security policy that pinned only
 * `talent_id`. That policy could not tell a free training from a paid one, so
 * anyone could enrol themselves in a 250,000 naira course by inserting the
 * row directly and never touching the payment flow. Migration 0058 removes
 * the policy; this is the replacement, and it checks the price.
 *
 * Paid trainings keep going through /api/pay/training, which raises the
 * payment record and settles the enrolment on confirmation.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { training_id } = await request.json().catch(() => ({} as any));
  if (!training_id)
    return NextResponse.json({ error: "Which training? None was named." }, { status: 400 });

  const admin = createAdminClient();
  const { data: training } = await admin.from("trainings")
    .select("id, title, status, price_ngn, price_usd, capacity, starts_at")
    .eq("id", training_id).maybeSingle();
  if (!training)
    return NextResponse.json({ error: "That training no longer exists." }, { status: 404 });

  // The price is read from the database, never from the request, which is the
  // whole point of moving this off the client.
  const ngn = Number(training.price_ngn) || 0;
  const usd = Number(training.price_usd) || 0;
  if (ngn > 0 || usd > 0) {
    return NextResponse.json({
      error: "This training is paid, so registration goes through checkout rather than straight through.",
      paid: true
    }, { status: 400 });
  }

  if (training.status && !["open", "published", "scheduled"].includes(String(training.status))) {
    return NextResponse.json({
      error: "This training is not open for registration."
    }, { status: 400 });
  }

  // Capacity, if the training sets one. Counted here rather than trusted from
  // the page, which may have been open for an hour.
  if (training.capacity) {
    const { count } = await admin.from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("training_id", training.id).neq("status", "cancelled");
    if ((count ?? 0) >= Number(training.capacity)) {
      return NextResponse.json({
        error: "This training is full. Ask the team to be put on the waiting list."
      }, { status: 409 });
    }
  }

  const { error } = await admin.from("enrollments")
    .insert({ training_id: training.id, talent_id: user.id, status: "registered" });

  // Registering twice is not an error from the person's point of view: they
  // are registered either way, which is all they wanted to know.
  if (error && !/duplicate|unique/i.test(error.message))
    return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("notifications").insert({
    profile_id: user.id,
    title: "You are registered",
    body: `You are registered for "${training.title}". Details and joining instructions are on your trainings page.`,
    link: "/portal/seeker/trainings"
  }).select("id");

  return NextResponse.json({ ok: true, already: !!error });
}
