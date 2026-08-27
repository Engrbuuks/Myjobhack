import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatch } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Email a selected set of applicants.
 *
 * Deliberately takes explicit application IDs rather than a filter definition:
 * whoever sends must have SEEN the list they are emailing. Passing a filter
 * server-side risks the set having changed since it was reviewed.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!["admin", "recruiter", "employer"].includes(me?.role ?? ""))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { application_ids, subject, body, job_id } = await request.json();
  const ids: string[] = Array.isArray(application_ids) ? application_ids.filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "Select at least one applicant." }, { status: 400 });
  if (!subject?.trim() || !body?.trim())
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  if (ids.length > 300)
    return NextResponse.json({ error: "That's more than 300 recipients — narrow the filter first." }, { status: 400 });

  const { data: apps } = await admin.from("applications")
    .select("id, talent_id, guest_name, guest_email, job_id").in("id", ids);
  if (!apps?.length) return NextResponse.json({ error: "No applicants found." }, { status: 404 });

  // An employer may only email applicants to their own postings.
  if (me?.role === "employer") {
    const jobIds = Array.from(new Set(apps.map((a: any) => a.job_id)));
    const { data: owned } = await admin.from("jobs")
      .select("id").in("id", jobIds).eq("created_by", user.id);
    const ownedIds = new Set((owned ?? []).map((j: any) => j.id));
    if (apps.some((a: any) => !ownedIds.has(a.job_id)))
      return NextResponse.json({ error: "Some of those applicants aren't on your postings." }, { status: 403 });
  }

  const { data: job } = job_id
    ? await admin.from("jobs").select("title").eq("id", job_id).maybeSingle()
    : { data: null };

  // Resolve a name and address for each, members and guests alike.
  const recipients: { email: string; name: string }[] = [];
  for (const a of apps as any[]) {
    if (a.talent_id) {
      const { data: p } = await admin.from("profiles")
        .select("full_name, email").eq("id", a.talent_id).maybeSingle();
      if (p?.email) recipients.push({ email: p.email, name: p.full_name ?? "there" });
    } else if (a.guest_email) {
      recipients.push({ email: a.guest_email, name: a.guest_name ?? "there" });
    }
  }
  if (!recipients.length)
    return NextResponse.json({ error: "None of those applicants have an email address on file." }, { status: 400 });

  // Personalise the greeting; everything else is what the sender wrote.
  const emails = recipients.map((r) => ({
    to: r.email,
    subject: subject.trim(),
    html: renderEmail({
      kicker: job?.title ? `Regarding: ${job.title}` : "An update on your application",
      heading: subject.trim(),
      paragraphs: [
        `Hi ${r.name.split(" ")[0]},`,
        ...body.split(/\n{2,}/).map((s: string) => s.trim()).filter(Boolean),
        me?.full_name ? `— ${me.full_name}, MYJOBHACK` : "— MYJOBHACK"
      ]
    })
  }));

  // Paced, since this is bulk mail to a filtered segment.
  const results = await sendBatch(emails, { bulk: true, chunkSize: 20, pauseMs: 1500 });
  const sent = results.filter((r) => !r.error).length;
  const failed = results.length - sent;

  return NextResponse.json({
    ok: true, sent, failed,
    message: `Sent to ${sent} applicant${sent === 1 ? "" : "s"}.` + (failed ? ` ${failed} failed.` : "")
  });
}
