import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { querySegment, SegmentFilters } from "@/lib/segment";
import { sendBatch, inviteEmailHtml } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin" && me?.role !== "recruiter")
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await request.json();
  const message = body.message ?? null;
  const { training, filters }: {
    training: { id?: string; title: string; description: string; delivery: string; starts_at: string | null; location_or_link: string };
    filters: SegmentFilters;
  } = body;

  if (!training?.title) return NextResponse.json({ error: "Training title required" }, { status: 400 });

  // 1) training: reuse or create
  let trainingId = training.id;
  if (!trainingId) {
    const { data: t, error: tErr } = await supabase.from("trainings")
      .insert({
        title: training.title,
        description: training.description ?? "",
        delivery: (training.delivery === "lms" ? "lms" : "external") as any,
        status: "open",
        starts_at: training.starts_at || null,
        location_or_link: training.location_or_link ?? "",
        created_by: user.id
      })
      .select("id").single();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    trainingId = t.id;
  }

  // 2) resolve the segment
  const rows = await querySegment(supabase, filters ?? {});
  const targets = rows
    .filter((r) => r.profile?.email)
    .map((r) => ({ talent_id: r.profile_id, email: r.profile!.email as string, name: r.profile!.full_name ?? "" }));
  if (targets.length === 0)
    return NextResponse.json({ error: "Segment is empty — no talent matches these filters" }, { status: 400 });

  // 3) batch record (audit of the exact filter used)
  const { data: batch, error: bErr } = await supabase.from("invite_batches")
    .insert({ training_id: trainingId, filters: filters ?? {}, matched_count: targets.length, created_by: user.id })
    .select("id").single();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  // 4) invite rows (skip already-invited via upsert-ignore behavior)
  const { data: existing } = await supabase.from("training_invites")
    .select("talent_id").eq("training_id", trainingId);
  const already = new Set((existing ?? []).map((e) => e.talent_id));
  const fresh = targets.filter((t) => !already.has(t.talent_id));

  if (fresh.length > 0) {
    const { error: iErr } = await supabase.from("training_invites").insert(
      fresh.map((t) => ({
        batch_id: batch.id, training_id: trainingId, talent_id: t.talent_id,
        email: t.email, status: "queued"
      }))
    );
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  }

  // 5) send via Resend
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
  const when = training.starts_at
    ? new Date(training.starts_at).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })
    : "Date to be announced";
  const useCustom = message && (message.opening || (message.bullets ?? []).length);
  const results = await sendBatch(
    fresh.map((t) => ({
      to: t.email,
      subject: useCustom && message.subject ? message.subject : `You're invited: ${training.title}`,
      html: useCustom
        ? renderEmail({
            kicker: "You're invited",
            heading: message.hook || training.title,
            paragraphs: [
              `Hi ${t.name.split(" ")[0]},`,
              ...(message.opening ? [message.opening] : []),
              ...(message.closing ? [message.closing] : [])
            ],
            bullets: (message.bullets ?? []).filter(Boolean),
            details: [["When", when], ["Where", training.location_or_link || "Details in your portal"]],
            cta: { label: message.cta_label || "Accept my invite", url: `${appUrl}/portal/seeker/trainings` }
          })
        : inviteEmailHtml({
            name: t.name.split(" ")[0], trainingTitle: training.title,
            description: training.description ?? "",
            when, where: training.location_or_link || "Details in your portal", appUrl
          })
    }))
  );

  // 6) mark statuses
  let sent = 0, failed = 0;
  await Promise.all(
    fresh.map((t, i) => {
      const r = results[i];
      if (r?.id) sent++; else failed++;
      return supabase.from("training_invites")
        .update({
          status: r?.id ? "sent" : "failed",
          provider_message_id: r?.id ?? null,
          sent_at: r?.id ? new Date().toISOString() : null
        })
        .eq("training_id", trainingId!).eq("talent_id", t.talent_id);
    })
  );

  await supabase.from("activity_log").insert({
    actor_id: user.id, action: `Sent ${sent} training invites`, entity: "training", entity_id: trainingId,
    meta: { filters, matched: targets.length, sent, failed, skipped_already_invited: already.size }
  });

  const keyMissing = !process.env.RESEND_API_KEY;
  return NextResponse.json({
    training_id: trainingId, matched: targets.length,
    skipped: targets.length - fresh.length, sent, failed,
    note: keyMissing ? "RESEND_API_KEY is not set — invites saved as failed. Add the key in Vercel and resend." : null
  });
}
