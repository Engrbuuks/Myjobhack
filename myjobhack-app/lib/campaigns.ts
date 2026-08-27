import { renderEmail } from "@/lib/email";
import { sendBatch } from "@/lib/resend";

export function renderCampaign(d: any) {
  return renderEmail({
    preheader: d.preheader,
    kicker: d.kicker || "From Myjobhack",
    heading: d.hook,
    paragraphs: [d.opening, ...(d.closing ? [d.closing] : [])].filter(Boolean),
    bullets: d.bullets ?? [],
    cta: { label: d.cta_label, url: d.cta_url },
    footNote: "You're receiving this as a MYJOBHACK member. Manage preferences in your portal."
  });
}

export async function resolveAudience(admin: any, audience: string, nicheId?: string | null, emailList?: string | null): Promise<string[]> {
  let emails: string[] = [];
  if (audience === "all_talent") {
    const { data } = await admin.from("profiles").select("email").in("role", ["job_seeker", "elite_member"]);
    emails = (data ?? []).map((p: any) => p.email).filter(Boolean);
  } else if (audience === "elite") {
    const { data } = await admin.from("profiles").select("email").eq("role", "elite_member");
    emails = (data ?? []).map((p: any) => p.email).filter(Boolean);
  } else if (audience === "niche" && nicheId) {
    const { data: tps } = await admin.from("talent_profiles").select("profile_id").eq("niche_id", nicheId);
    const ids = (tps ?? []).map((t: any) => t.profile_id);
    if (ids.length) {
      const { data } = await admin.from("profiles").select("email").in("id", ids);
      emails = (data ?? []).map((p: any) => p.email).filter(Boolean);
    }
  } else if (audience === "applicants") {
    // Everyone who has applied to any role — the marketing database.
    const { data } = await admin.from("marketing_contacts")
      .select("email").eq("consent", true).is("unsubscribed_at", null);
    emails = (data ?? []).map((m: any) => m.email).filter(Boolean);
  } else if (audience === "all_contacts") {
    // Members + applicants combined, consented only.
    const { data: mc } = await admin.from("marketing_contacts")
      .select("email").eq("consent", true).is("unsubscribed_at", null);
    const { data: pf } = await admin.from("profiles")
      .select("email").in("role", ["job_seeker", "elite_member"]);
    emails = [...(mc ?? []), ...(pf ?? [])].map((r: any) => r.email).filter(Boolean);
  } else if (audience === "list") {
    emails = String(emailList ?? "").split(/[\s,;]+/).filter((e) => e.includes("@"));
  }
  return Array.from(new Set(emails));
}

/** Send one stored campaign. Optimistically locks via status transition. */
export async function dispatchCampaign(admin: any, id: string): Promise<{ ok: boolean; sent?: number; recipients?: number; error?: string }> {
  // lock: only proceed if we're the one flipping scheduled → sending
  const { data: locked } = await admin.from("campaigns")
    .update({ status: "sending" }).eq("id", id).eq("status", "scheduled").select("*").maybeSingle();
  if (!locked) return { ok: false, error: "Already handled" };

  try {
    const emails = await resolveAudience(admin, locked.audience, locked.niche_id, locked.email_list);
    if (emails.length === 0) {
      await admin.from("campaigns").update({ status: "failed", error: "No recipients resolved" }).eq("id", id);
      return { ok: false, error: "No recipients resolved" };
    }
    const html = renderCampaign(locked.draft);
    const results = await sendBatch(emails.map((to) => ({ to, subject: locked.subject, html })));
    const sent = results.filter((r) => !r.error).length;
    await admin.from("campaigns").update({
      status: "sent", sent_at: new Date().toISOString(),
      recipients: emails.length, sent_count: sent
    }).eq("id", id);
    await admin.from("activity_log").insert({
      actor_id: locked.created_by, action: "Scheduled campaign sent", entity: "campaign", entity_id: id,
      meta: { subject: locked.subject, recipients: emails.length, sent }
    });
    return { ok: true, sent, recipients: emails.length };
  } catch (e: any) {
    await admin.from("campaigns").update({ status: "failed", error: e?.message ?? "dispatch error" }).eq("id", id);
    return { ok: false, error: e?.message };
  }
}

/** Fire everything due. Called by the daily cron AND opportunistically from the admin desk. */
export async function dispatchDue(admin: any): Promise<number> {
  const { data: due } = await admin.from("campaigns")
    .select("id").eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString()).limit(10);
  let fired = 0;
  for (const c of due ?? []) {
    const r = await dispatchCampaign(admin, c.id);
    if (r.ok) fired++;
  }
  return fired;
}
