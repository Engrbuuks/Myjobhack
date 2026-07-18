import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatch } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isStaff = me?.role === "admin" || me?.role === "recruiter" || me?.role === "trainer";
  if (!isStaff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { training_id, subject, message, statuses } = await request.json();
  if (!training_id || !subject || !message)
    return NextResponse.json({ error: "training_id, subject, message required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: training } = await admin.from("trainings")
    .select("title, trainer_id, starts_at, location_or_link").eq("id", training_id).single();
  if (!training) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (me?.role === "trainer" && training.trainer_id !== user.id)
    return NextResponse.json({ error: "Not your training" }, { status: 403 });

  let q = admin.from("enrollments").select("talent_id").eq("training_id", training_id);
  if (Array.isArray(statuses) && statuses.length) q = q.in("status", statuses);
  const { data: enrolls } = await q;
  const ids = Array.from(new Set((enrolls ?? []).map((e) => e.talent_id)));
  if (ids.length === 0) return NextResponse.json({ error: "No registered participants match." }, { status: 400 });

  const { data: profs } = await admin.from("profiles").select("email, full_name").in("id", ids);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const when = training.starts_at
    ? new Date(training.starts_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }) : null;

  const results = await sendBatch(
    (profs ?? []).filter((p) => p.email).map((p) => ({
      to: p.email,
      subject,
      html: renderEmail({
        kicker: training.title,
        heading: subject,
        paragraphs: [`Hi ${(p.full_name || "there").split(" ")[0]},`, message],
        details: [
          ...(when ? [["When", when] as [string, string]] : []),
          ...(training.location_or_link ? [["Where", training.location_or_link] as [string, string]] : [])
        ],
        cta: { label: "View training", url: `${appUrl}/portal/seeker/trainings` }
      })
    }))
  );
  const sent = results.filter((r) => !r.error).length;
  await admin.from("activity_log").insert({
    actor_id: user.id, action: "Emailed training participants", entity: "training", entity_id: training_id,
    meta: { subject, recipients: ids.length, sent }
  });
  return NextResponse.json({ ok: true, recipients: ids.length, sent });
}
