import { routeMail } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";
import { getAllowance, logSends } from "@/lib/emailAllowance";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";
const KEY = "offer_digest";

/**
 * One morning email about offer responses, instead of one per response.
 *
 * Accepting or declining used to email everyone copied on the offer and the
 * sender, at once, with the signed PDF attached: up to seven messages for a
 * single acceptance, none counted against the allowance. Fifty responses in a
 * day could spend the provider's whole daily limit before anything else went
 * out. This sends each person ONE email covering every response on the offers
 * they sent or were copied on since the last summary.
 *
 * WHO RECEIVES WHAT. A person sees only the offers they sent or were copied
 * on, the same offers they were already told about, so a summary never shows
 * anyone a salary or a name they had not been sent before.
 *
 * WHEN THERE IS NOTHING, NOTHING IS SENT. And the window only moves forward
 * after a run that sent what it had, so a day the allowance ran out is carried
 * into the next summary rather than lost.
 */
export async function sendOfferDigest(admin: any): Promise<{
  ok: boolean; recipients: number; responses: number; skipped?: string; failed?: number;
}> {
  const now = new Date();
  const { data: cfg } = await admin.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const lastRun = (cfg?.value as any)?.last_run as string | undefined;
  // First run, or a long gap: look back a day, not to the beginning of time.
  const since = lastRun && Date.parse(lastRun) > now.getTime() - 7 * 864e5
    ? new Date(lastRun) : new Date(now.getTime() - 864e5);
  const s = since.toISOString(), n = now.toISOString();

  const COLS = "id, candidate_name, position_title, status, signed_at, declined_at, decline_reason, expires_at, sent_by, cc_emails";
  const load = (withLocation: boolean) => admin.from("offer_letters")
    .select(withLocation ? `${COLS}, location_id` : COLS)
    .or(`and(signed_at.gt.${s},signed_at.lte.${n}),and(declined_at.gt.${s},declined_at.lte.${n}),and(status.eq.sent,expires_at.gt.${s},expires_at.lte.${n})`)
    .limit(2000);
  let { data: rows, error } = await load(true);
  if (error && /location_id/.test(error.message)) ({ data: rows, error } = await load(false));
  if (error) return { ok: false, recipients: 0, responses: 0, skipped: error.message };

  const responses = (rows ?? []) as any[];
  if (!responses.length) {
    await saveRun(admin, n);
    return { ok: true, recipients: 0, responses: 0, skipped: "No responses since the last summary." };
  }

  // Location names, when locations are in use.
  const locIds = Array.from(new Set(responses.map((r) => r.location_id).filter(Boolean)));
  const locName = new Map<string, string>();
  if (locIds.length) {
    const { data: locs } = await admin.from("offer_locations").select("id, name").in("id", locIds);
    for (const l of locs ?? []) locName.set(l.id, l.name);
  }

  // Who sent each offer, so the sender is told as well as those copied in.
  const senderIds = Array.from(new Set(responses.map((r) => r.sent_by).filter(Boolean)));
  const senders = new Map<string, { email: string; name: string }>();
  if (senderIds.length) {
    const { data: ps } = await admin.from("profiles").select("id, email, full_name").in("id", senderIds);
    for (const p of ps ?? []) if (p.email) senders.set(p.id, { email: p.email, name: p.full_name ?? "" });
  }

  // Group the responses by the person who should hear about them.
  const byPerson = new Map<string, any[]>();
  for (const r of responses) {
    const who = new Set<string>();
    const sender = r.sent_by ? senders.get(r.sent_by) : null;
    if (sender) who.add(sender.email.trim().toLowerCase());
    for (const cc of r.cc_emails ?? []) if (String(cc).includes("@")) who.add(String(cc).trim().toLowerCase());
    for (const e of Array.from(who)) byPerson.set(e, [...(byPerson.get(e) ?? []), r]);
  }
  if (!byPerson.size) {
    await saveRun(admin, n);
    return { ok: true, recipients: 0, responses: responses.length, skipped: "Nobody to tell: no sender or copied address on these offers." };
  }

  // Names for the greeting. Staff have profiles; an outside address copied in
  // may not, and is greeted without a name rather than with a guess.
  const emails = Array.from(byPerson.keys());
  const names = new Map<string, string>();
  const { data: people } = await admin.from("profiles").select("email, full_name").in("email", emails);
  for (const p of people ?? []) if (p.email && p.full_name) names.set(p.email.toLowerCase(), p.full_name);
  for (const v of Array.from(senders.values())) if (v.name) names.set(v.email.toLowerCase(), v.name);

  // Everything or nothing against the allowance: a summary half delivered
  // would advance the window past people who never received it.
  const allowance = await getAllowance(admin);
  if (allowance.remaining < emails.length)
    return {
      ok: false, recipients: 0, responses: responses.length,
      skipped: `Only ${allowance.remaining} emails left today and the summary needs ${emails.length}. It will include these tomorrow.`
    };

  const when = since.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });
  const messages = emails.map((to) => {
    const mine = byPerson.get(to)!;
    const first = (names.get(to) ?? "").split(" ")[0];
    return { to, subject: subjectFor(mine), html: bodyFor(mine, first, when, locName) };
  });

  const results = await routeMail(messages as any, { bulk: false });
  await logSends(admin, messages.map((m, i) => ({
    recipient: m.to, subject: m.subject, kind: "transactional", tag: "offer_digest",
    status: results[i]?.error ? "failed" : "sent", error: results[i]?.error ?? null,
    provider: (results[i] as any)?.provider ?? "resend",
    preview: `Offer responses since ${since.toISOString()}`
  })));

  const failed = results.filter((r) => r?.error).length;
  // Move the window on only when everyone was reached.
  if (!failed) await saveRun(admin, n);
  return { ok: !failed, recipients: emails.length, responses: responses.length, failed };
}

async function saveRun(admin: any, at: string) {
  const { data } = await admin.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  await admin.from("app_settings").upsert({ key: KEY, value: { ...((data?.value as any) ?? {}), last_run: at } });
}

function outcome(r: any): "accepted" | "declined" | "expired" {
  return r.signed_at ? "accepted" : r.declined_at ? "declined" : "expired";
}

function subjectFor(rows: any[]): string {
  const c = { accepted: 0, declined: 0, expired: 0 };
  for (const r of rows) c[outcome(r)]++;
  const parts = [
    c.accepted && `${c.accepted} accepted`,
    c.declined && `${c.declined} declined`,
    c.expired && `${c.expired} expired`
  ].filter(Boolean);
  return `Offer responses: ${parts.join(", ")}`;
}

/**
 * Counts first, then by location, then one line per person. Declines lead,
 * because each one is a seat to refill, and carry their reason when one was
 * given. Plain text throughout: renderEmail escapes everything it is handed.
 */
export function bodyFor(rows: any[], first: string, when: string, locName: Map<string, string>): string {
  const c = { accepted: 0, declined: 0, expired: 0 };
  for (const r of rows) c[outcome(r)]++;

  const paragraphs: string[] = [
    `${first ? `${first}, here` : "Here"} is what happened to your offers since ${when}: ` +
      `${c.accepted} accepted, ${c.declined} declined, ${c.expired} expired unanswered.`
  ];

  // By location, only when any of these offers carry one.
  if (rows.some((r) => r.location_id)) {
    const per = new Map<string, { accepted: number; declined: number; expired: number }>();
    for (const r of rows) {
      const k = r.location_id ? (locName.get(r.location_id) ?? "Unnamed") : "Not tagged";
      const v = per.get(k) ?? { accepted: 0, declined: 0, expired: 0 };
      v[outcome(r)]++;
      per.set(k, v);
    }
    const parts = Array.from(per.entries())
      .sort((a, b) => (a[0] === "Not tagged" ? 1 : 0) - (b[0] === "Not tagged" ? 1 : 0) || a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k} ${[
        v.accepted && `${v.accepted} accepted`, v.declined && `${v.declined} declined`, v.expired && `${v.expired} expired`
      ].filter(Boolean).join(", ")}`);
    paragraphs.push(`By location: ${parts.join("; ")}.`);
  }

  const label = { declined: "Declined", expired: "Expired", accepted: "Accepted" } as const;
  const ordered = (["declined", "expired", "accepted"] as const)
    .flatMap((k) => rows.filter((r) => outcome(r) === k));
  const bullets = ordered.slice(0, 30).map((r) => {
    const k = outcome(r);
    const bits = [r.candidate_name, r.position_title, r.location_id ? locName.get(r.location_id) : null].filter(Boolean);
    const why = k === "declined" && r.decline_reason ? `. Reason: ${String(r.decline_reason).slice(0, 160)}` : "";
    return `${label[k]}: ${bits.join(", ")}${why}`;
  });
  if (ordered.length > 30) bullets.push(`And ${ordered.length - 30} more on the Offers page`);

  return renderEmail({
    preheader: subjectFor(rows),
    kicker: "Offer responses",
    heading: c.declined
      ? `${c.declined} to refill, ${c.accepted} accepted`
      : c.accepted ? `${c.accepted} accepted` : `${c.expired} expired unanswered`,
    paragraphs,
    bullets,
    cta: { label: "Open the Offers page", url: `${APP()}/portal/admin/offers` },
    footNote: "Signed letters are on the Offers page. None are attached, to save the daily email allowance."
  });
}
