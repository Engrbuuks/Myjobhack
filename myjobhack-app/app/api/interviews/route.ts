import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/** Resolve caller authority over an application's job: 'staff' | 'org' | null */
async function authority(userId: string, jobOrgId: string | null, role: string | undefined) {
  if (role === "admin" || role === "recruiter") return "staff";
  if (!jobOrgId) return null;
  const admin = createAdminClient();
  const { data: m } = await admin.from("org_members")
    .select("org_id").eq("org_id", jobOrgId).eq("profile_id", userId).maybeSingle();
  return m ? "org" : null;
}

function fmtWhen(iso: string | null, tzNote = "WAT") {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ${tzNote}`;
}

// ---------- POST: invite to interview ----------
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();

  const b = await request.json();
  const { application_id, mode, scheduled_at, duration_min, location_or_link, calendly_url, message, round } = b;
  if (!application_id) return NextResponse.json({ error: "application_id required" }, { status: 400 });
  if (!scheduled_at && !calendly_url)
    return NextResponse.json({ error: "Set a time, or provide a Calendly link for the candidate to pick one." }, { status: 400 });

  const admin = createAdminClient();
  const { data: app } = await admin.from("applications").select("id, job_id, talent_id").eq("id", application_id).single();
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  const { data: job } = await admin.from("jobs").select("id, title, org_id").eq("id", app.job_id).single();
  const auth = await authority(user.id, job?.org_id ?? null, me?.role);
  if (!auth) return NextResponse.json({ error: "Not authorized for this job" }, { status: 403 });

  const { data: interview, error } = await admin.from("interviews").insert({
    application_id, job_id: app.job_id, talent_id: app.talent_id,
    org_id: job?.org_id ?? null, scheduled_by: user.id,
    round: round ?? 1, mode: mode ?? "video",
    scheduled_at: scheduled_at || null, duration_min: duration_min ?? 30,
    location_or_link: location_or_link ?? "", calendly_url: calendly_url ?? "",
    message: message ?? "",
    status: scheduled_at ? "scheduled" : "invited"
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("applications")
    .update({ status: "interviewing", reviewed_by: user.id }).eq("id", application_id);

  // company display name
  let host = "The MYJOBHACK team";
  if (job?.org_id) {
    const { data: org } = await admin.from("organizations").select("name").eq("id", job.org_id).single();
    if (org?.name) host = org.name;
  }

  const when = fmtWhen(scheduled_at || null);
  const { data: talent } = await admin.from("profiles").select("email, full_name").eq("id", app.talent_id).single();

  await admin.from("notifications").insert({
    profile_id: app.talent_id, title: "Interview invitation 🎯",
    body: `${host} wants to interview you for "${job?.title}". ${when ? `Scheduled: ${when}.` : "Pick a time that works for you."}`,
    link: "/portal/seeker/applications"
  });

  if (talent?.email) {
    const details: [string, string][] = [["Role", job?.title ?? ""], ["With", host]];
    if (when) details.push(["When", when]);
    details.push(["Format", (mode ?? "video").replace(/_/g, " ")]);
    if (duration_min) details.push(["Duration", `${duration_min ?? 30} minutes`]);
    if (location_or_link) details.push([mode === "in_person" ? "Venue" : "Join link", location_or_link]);

    await sendEmail(talent.email, `Interview invitation — ${job?.title}`, renderEmail({
      preheader: when ? `Scheduled for ${when}` : "Pick the time that works for you.",
      kicker: "Interview invitation",
      heading: "They want to meet you.",
      paragraphs: [
        `Hi ${(talent.full_name || "there").split(" ")[0]} — your application for "${job?.title}" stood out. ${host} has invited you to interview.`,
        ...(message ? [message] : []),
        ...(calendly_url && !when ? ["Choose the slot that works best for you using the button below — it takes a minute."] : [])
      ],
      details,
      cta: calendly_url && !when
        ? { label: "Pick your time", url: calendly_url }
        : { label: "View interview details", url: `${APP()}/portal/seeker/applications` },
      footNote: "Can't make it? Reply to this email or contact the team — rescheduling is fine."
    }));
  }

  await admin.from("activity_log").insert({
    actor_id: user.id, action: "Interview invitation sent", entity: "interview", entity_id: interview.id,
    meta: { job: job?.title, scheduled: !!scheduled_at, calendly: !!calendly_url }
  });

  return NextResponse.json({ ok: true, id: interview.id });
}

// ---------- PATCH: handle (status / scorecard / outcome) ----------
export async function PATCH(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  const b = await request.json();
  const { id, action } = b;
  if (!id || !action) return NextResponse.json({ error: "id and action required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: iv } = await admin.from("interviews")
    .select("id, application_id, talent_id, org_id, status, job_id").eq("id", id).single();
  if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await authority(user.id, iv.org_id, me?.role);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (action === "mark_scheduled") {
    patch.status = "scheduled";
    if (b.scheduled_at) patch.scheduled_at = b.scheduled_at;
  } else if (action === "complete") patch.status = "completed";
  else if (action === "no_show") patch.status = "no_show";
  else if (action === "cancel") patch.status = "cancelled";
  else if (action === "save_review") {
    if (b.scorecard !== undefined) patch.scorecard = b.scorecard;
    if (b.feedback !== undefined) patch.feedback = b.feedback;
    if (iv.status !== "completed") patch.status = "completed";
  } else if (action === "outcome") {
    if (!["advanced", "hold", "rejected"].includes(b.outcome))
      return NextResponse.json({ error: "outcome must be advanced/hold/rejected" }, { status: 400 });
    patch.outcome = b.outcome;
    if (iv.status === "invited" || iv.status === "scheduled") patch.status = "completed";
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await admin.from("interviews").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // outcome drives the application pipeline + tells the candidate
  if (action === "outcome") {
    const map: Record<string, string> = { advanced: "offered", rejected: "rejected" };
    if (map[b.outcome]) {
      await admin.from("applications")
        .update({ status: map[b.outcome] as any, reviewed_by: user.id }).eq("id", iv.application_id);
    }
    const { data: job } = await admin.from("jobs").select("title").eq("id", iv.job_id).single();
    const msgs: Record<string, { t: string; b: string }> = {
      advanced: { t: "Good news after your interview 🎉", b: `You've been advanced for "${job?.title}". Watch your applications for the offer.` },
      hold: { t: "Interview update", b: `Your interview for "${job?.title}" is under review — you'll hear back soon.` },
      rejected: { t: "Interview update", b: `Thank you for interviewing for "${job?.title}". The team went another direction this time — your profile stays in the pool for matching.` }
    };
    const m = msgs[b.outcome];
    await admin.from("notifications").insert({
      profile_id: iv.talent_id, title: m.t, body: m.b, link: "/portal/seeker/applications"
    });
  }

  await admin.from("activity_log").insert({
    actor_id: user.id, action: `Interview ${action}`, entity: "interview", entity_id: id, meta: { outcome: b.outcome }
  });
  return NextResponse.json({ ok: true });
}
