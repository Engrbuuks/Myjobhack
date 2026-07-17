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

  const { course_id } = await request.json();
  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 });

  // verify: every lesson in the course is completed by this user
  const { data: mods } = await supabase.from("course_modules").select("id").eq("course_id", course_id);
  const modIds = (mods ?? []).map((m) => m.id);
  if (modIds.length === 0) return NextResponse.json({ error: "Empty course" }, { status: 400 });
  const { data: lessons } = await supabase.from("lessons").select("id").in("module_id", modIds);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length === 0) return NextResponse.json({ error: "Empty course" }, { status: 400 });
  const { data: progress } = await supabase
    .from("lesson_progress").select("lesson_id").eq("talent_id", user.id).in("lesson_id", lessonIds);
  if ((progress ?? []).length < lessonIds.length)
    return NextResponse.json({ error: "Course not fully completed" }, { status: 400 });

  const admin = createAdminClient();

  // idempotent certificate
  const { data: existing } = await admin.from("certificates")
    .select("id, serial").eq("talent_id", user.id).eq("course_id", course_id).maybeSingle();
  if (existing) return NextResponse.json({ certificate_id: existing.id, serial: existing.serial });

  const serial = `MJH-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const { data: cert, error } = await admin.from("certificates")
    .insert({ talent_id: user.id, course_id, serial }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // mark any linked enrollment completed
  const { data: linkedTrainings } = await admin.from("trainings").select("id").eq("course_id", course_id);
  for (const t of linkedTrainings ?? []) {
    await admin.from("enrollments")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("training_id", t.id).eq("talent_id", user.id);
  }

  const { data: course } = await admin.from("courses").select("title").eq("id", course_id).single();
  await admin.from("notifications").insert({
    profile_id: user.id, title: "Certificate earned 🎓",
    body: `You completed "${course?.title}". Your certificate ${serial} is ready.`,
    link: "/portal/seeker/trainings"
  });
  await admin.from("activity_log").insert({
    actor_id: user.id, action: "Completed course", entity: "certificate", entity_id: cert.id,
    meta: { course: course?.title, serial }
  });
  const { data: prof } = await admin.from("profiles").select("email, full_name").eq("id", user.id).single();
  if (prof?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
    await sendEmail(prof.email, `Certificate earned — ${course?.title ?? "MYJOBHACK Training"} 🎓`, renderEmail({
      preheader: `Serial ${serial} — your certificate is ready to view and share.`,
      kicker: "Myjobhack Academy",
      heading: "Certificate earned.",
      paragraphs: [
        `Congratulations ${(prof.full_name || "").split(" ")[0]} — you completed "${course?.title ?? "your course"}" and your certificate has been issued.`,
        "This completion is now part of your matching profile — employers and our recruitment team can see what you've built."
      ],
      details: [["Serial", serial], ["Issued", new Date().toLocaleDateString("en-GB", { dateStyle: "long" })]],
      cta: { label: "View certificate", url: `${appUrl}/portal/seeker/trainings` }
    }));
  }

  return NextResponse.json({ certificate_id: cert.id, serial });
}
