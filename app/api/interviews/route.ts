import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";
import { renderTemplate, toParagraphs, varsFor,
         CANCEL_SUBJECT, CANCEL_BODY, RESCHEDULE_SUBJECT, RESCHEDULE_BODY } from "@/lib/interviewEmail";

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
  const { data: app } = await admin.from("applications")
    .select("id, job_id, talent_id, guest_name, guest_email").eq("id", application_id).single();
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  const { data: job } = await admin.from("jobs").select("id, title, org_id").eq("id", app.job_id).single();
  const auth = await authority(user.id, job?.org_id ?? null, me?.role);
  if (!auth) return NextResponse.json({ error: "Not authorized for this job" }, { status: 403 });

  /**
   * Guests can be interviewed too.
   *
   * talent_id is null for anyone who applied without registering, which is
   * most applicants. Their name and email are carried on the interview row
   * instead, the same way the bulk scheduler does it.
   */
  const { data: interview, error } = await admin.from("interviews").insert({
    application_id, job_id: app.job_id, talent_id: app.talent_id,
    guest_name: app.talent_id ? null : (app.guest_name ?? null),
    guest_email: app.talent_id ? null : (app.guest_email ?? null),
    timezone: "Africa/Lagos",
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

  // A guest has no profile row, so look one up only when there is one.
  const { data: talent } = app.talent_id
    ? await admin.from("profiles").select("email, full_name").eq("id", app.talent_id).maybeSingle()
    : { data: null as any };

  const recipientEmail = talent?.email ?? app.guest_email ?? null;

  // In app notifications need a profile. Guests get the email only, which is
  // the whole channel they have.
  if (app.talent_id) {
    await admin.from("notifications").insert({
      profile_id: app.talent_id, title: "Interview invitation 🎯",
      body: `${host} wants to interview you for "${job?.title}". ${when ? `Scheduled: ${when}.` : "Pick a time that works for you."}`,
      link: "/portal/seeker/applications"
    });
  }

  if (recipientEmail) {
    const details: [string, string][] = [["Role", job?.title ?? ""], ["With", host]];
    if (when) details.push(["When", when]);
    details.push(["Format", (mode ?? "video").replace(/_/g, " ")]);
    if (duration_min) details.push(["Duration", `${duration_min ?? 30} minutes`]);
    if (location_or_link) details.push([mode === "in_person" ? "Venue" : "Join link", location_or_link]);

    const recipientName = talent?.full_name ?? app.guest_name ?? "there";
    await sendEmail(recipientEmail, `Interview invitation: ${job?.title}`, renderEmail({
      preheader: when ? `Scheduled for ${when}` : "Pick the time that works for you.",
      kicker: "Interview invitation",
      heading: "They want to meet you.",
      paragraphs: [
        `Hi ${recipientName.split(" ")[0]}, your application for "${job?.title}" stood out. ${host} has invited you to interview.`,
        ...(message ? [message] : []),
        ...(calendly_url && !when ? ["Choose the slot that works best for you using the button below. It takes a minute."] : [])
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
    .select("id, application_id, talent_id, org_id, status, job_id, scheduled_at, duration_min, timezone, guest_name, guest_email, location_or_link")
    .eq("id", id).single();
  if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const auth = await authority(user.id, iv.org_id, me?.role);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (action === "mark_scheduled") {
    patch.status = "scheduled";
    if (b.scheduled_at) patch.scheduled_at = b.scheduled_at;
  } else if (action === "complete") patch.status = "completed";
  else if (action === "no_show") patch.status = "no_show";
  else if (action === "cancel") {
    /**
     * Cancelling records who, when and why, and tells the candidate.
     *
     * Silently flipping a status leaves someone holding an invitation for a
     * time that no longer exists. They travel to it. The reason is stored
     * either way, and shared with the candidate only if asked for.
     */
    patch.status = "cancelled";
    patch.cancelled_at = new Date().toISOString();
    patch.cancelled_by = user.id;
    patch.cancel_reason = String(b.reason ?? "").slice(0, 300) || null;
  }
  else if (action === "save_review") {
    if (b.scorecard !== undefined) patch.scorecard = b.scorecard;
    if (b.feedback !== undefined) patch.feedback = b.feedback;
    if (iv.status !== "completed") patch.status = "completed";
  } else if (action === "outcome") {
    if (!["advanced", "hold", "rejected"].includes(b.outcome))
      return NextResponse.json({ error: "outcome must be advanced/hold/rejected" }, { status: 400 });
    patch.outcome = b.outcome;
    if (iv.status === "invited" || iv.status === "scheduled") patch.status = "completed";
  } else if (action === "reschedule") {
    /**
     * Move an interview to a new time in one step.
     *
     * Cancelling and then creating a second interview sends two emails: one
     * saying it is off, one saying it is on. The candidate reads them in
     * whatever order they arrive. This sends a single message that says the
     * time has moved and states the new one.
     */
    if (!b.scheduled_at)
      return NextResponse.json({ error: "A new date and time is required to reschedule." }, { status: 400 });
    patch.scheduled_at = b.scheduled_at;
    patch.status = "scheduled";
    if (b.duration_min) patch.duration_min = Number(b.duration_min);
    if (b.location_or_link !== undefined) patch.location_or_link = String(b.location_or_link);
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await admin.from("interviews").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ---- reschedule: one email stating the new time ----
  if (action === "reschedule") {
    const { data: prof } = iv.talent_id
      ? await admin.from("profiles").select("full_name, email").eq("id", iv.talent_id).maybeSingle()
      : { data: null as any };
    const to = prof?.email ?? iv.guest_email ?? null;
    const who = prof?.full_name ?? iv.guest_name ?? "there";
    const { data: jobRow } = await admin.from("jobs")
      .select("title, company_name").eq("id", iv.job_id).maybeSingle();

    let notified = false;
    if (to && b.notify !== false) {
      const v = varsFor({
        name: who, role: jobRow?.title ?? "the role",
        company: jobRow?.company_name ?? "MYJOBHACK",
        slotIso: String(b.scheduled_at),
        duration: Number(b.duration_min) || iv.duration_min || 30,
        location: (b.location_or_link ?? iv.location_or_link) || "",
        timezone: iv.timezone ?? "Africa/Lagos"
      });
      const r = await sendEmail(to, renderTemplate(RESCHEDULE_SUBJECT, v), renderEmail({
        preheader: `Your interview has moved to ${v.day_and_time}`,
        kicker: "Interview moved",
        heading: "Your interview time has changed",
        paragraphs: toParagraphs(renderTemplate(RESCHEDULE_BODY, v))
      })).catch(() => null);
      notified = !!r;
    }

    return NextResponse.json({
      ok: true, notified,
      message: notified
        ? `Moved, and ${who.split(" ")[0]} has been sent the new time.`
        : `Moved, but the email did not send. ${who.split(" ")[0]} still has the old time.`
    });
  }

  // ---- cancellation: tell the candidate, and correct the pipeline ----
  if (action === "cancel") {
    const { data: prof } = iv.talent_id
      ? await admin.from("profiles").select("full_name, email").eq("id", iv.talent_id).maybeSingle()
      : { data: null as any };
    const to = prof?.email ?? iv.guest_email ?? null;
    const who = prof?.full_name ?? iv.guest_name ?? "there";
    const { data: jobRow } = await admin.from("jobs")
      .select("title, company_name").eq("id", iv.job_id).maybeSingle();

    let notified = false;
    if (to && b.notify !== false) {
      const v = varsFor({
        name: who, role: jobRow?.title ?? "the role",
        company: jobRow?.company_name ?? "MYJOBHACK",
        slotIso: iv.scheduled_at ?? new Date().toISOString(),
        duration: iv.duration_min ?? 30,
        location: iv.location_or_link ?? "",
        timezone: iv.timezone ?? "Africa/Lagos",
        // Shared only when the person cancelling ticked that box.
        reason: b.share_reason && b.reason ? String(b.reason) : ""
      });
      const r = await sendEmail(to, renderTemplate(CANCEL_SUBJECT, v), renderEmail({
        preheader: "Your interview has been cancelled",
        kicker: "Interview cancelled",
        heading: "Your interview has been cancelled",
        paragraphs: toParagraphs(renderTemplate(CANCEL_BODY, v))
      })).catch(() => null);
      notified = !!r;
      if (notified) await admin.from("interviews").update({ cancel_notified: true }).eq("id", id);
    }

    /**
     * Put the application back to shortlisted. Leaving it at "interviewing"
     * counts someone in the pipeline who has no interview, which quietly
     * overstates how far along a job is.
     */
    if (iv.application_id) {
      await admin.from("applications")
        .update({ status: "shortlisted", reviewed_by: user.id })
        .eq("id", iv.application_id).eq("status", "interviewing");
    }

    return NextResponse.json({
      ok: true, notified,
      message: notified
        ? `Interview cancelled and ${who.split(" ")[0]} has been told.`
        : to
          ? `Interview cancelled, but the email did not send. ${who.split(" ")[0]} may still be expecting to attend.`
          : `Interview cancelled. There is no email address on file, so ${who.split(" ")[0]} has not been told.`
    });
  }

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
