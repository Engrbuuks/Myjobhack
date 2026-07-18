import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const b = await request.json();
  if (String(b.website ?? "")) return NextResponse.json({ ok: true }); // honeypot

  const { training_id, name, email, phone, country, message } = b;
  if (!training_id || !name?.trim() || !String(email ?? "").includes("@"))
    return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: training } = await admin.from("trainings")
    .select("id, title, starts_at, location_or_link, is_public").eq("id", training_id).single();
  if (!training?.is_public) return NextResponse.json({ error: "Training not available." }, { status: 404 });

  const { error } = await admin.from("training_interest").insert({
    training_id, name: name.trim(), email: String(email).trim().toLowerCase(),
    phone: phone || null, country: country || null, message: message || null
  });
  if (error && !error.message.includes("duplicate"))
    return NextResponse.json({ error: error.message }, { status: 500 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const when = training.starts_at
    ? new Date(training.starts_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })
    : "Dates announced soon";

  await sendEmail(String(email).trim(), `You're on the list — ${training.title}`, renderEmail({
    kicker: "Interest registered",
    heading: "We've got you.",
    paragraphs: [
      `Hi ${String(name).split(" ")[0]} — you're on the list for "${training.title}".`,
      "Our team will reach out with joining details. In the meantime, create your free profile so your seat, certificate, and future invitations all live in one place."
    ],
    details: [["Training", training.title], ["When", when]],
    cta: { label: "Create my free profile", url: `${appUrl}/join?ref=training-interest` }
  }));

  // tell the team
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  for (const a of admins ?? []) {
    await admin.from("notifications").insert({
      profile_id: a.id, title: "New training interest ✋",
      body: `${name} registered interest in "${training.title}".`,
      link: "/portal/admin/trainings"
    });
  }
  return NextResponse.json({ ok: true });
}
