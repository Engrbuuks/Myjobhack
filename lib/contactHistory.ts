/**
 * Who have we already emailed, and what did we send them.
 *
 * THE PROBLEM. Every send has always been written to email_log, and nothing
 * ever read it back. So after emailing some of the people at a stage and then
 * adding more people to that stage, the two groups were indistinguishable in
 * the applicant list. The only safe choices were to email nobody or to email
 * everybody again, and the second one is the kind of mistake a candidate
 * notices and mentions.
 *
 * Everything here reads. Nothing in this file sends or writes.
 */

/** One mailing this person has had, and when it reached them. */
export type MailingSent = { name: string; sentAt: string };

export type ContactRecord = {
  /** ISO timestamp of the most recent send. */
  sentAt: string;
  /** The subject as it was composed, tokens and all. */
  subject: string;
  /** 'bulk' for a campaign, 'transactional' for a receipt or an invitation. */
  kind: string;
  /** 'sent' or 'failed'. A failure is not a contact. */
  status: string;
  tag: string | null;
  /** How many messages this person has had in total, successful ones only. */
  count: number;
  /**
   * Every named mailing this person has had, newest first.
   *
   * This is the field that answers the real question. A hiring stage is used
   * as a mailing category: people are moved into "offered" and then written
   * to as a group, and more people join that group later. Knowing only that
   * somebody was emailed at some point does not say whether they had THIS
   * mailing, and that is the only thing that decides whether to write to
   * them again.
   */
  mailings: MailingSent[];
};

export type ContactHistory = {
  byApplication: Map<string, ContactRecord>;
  byEmail: Map<string, ContactRecord>;
};

/**
 * A stable key for "the same message".
 *
 * The subject is a poor key on its own: it carries tokens such as
 * {first_name}, so the rendered version differs per recipient, and a small
 * wording edit would make a repeat look like a new message. Lowercasing,
 * stripping the tokens and collapsing whitespace leaves something that stays
 * the same across both.
 */
export function messageTag(subject: string, explicit?: string | null): string {
  // A name the sender typed keeps its capitals, because it is shown back to
  // them. Whitespace is collapsed so "Office  invitation" and "Office
  // invitation" are not two mailings, and every comparison below is made
  // case insensitively for the same reason.
  if (explicit && explicit.trim())
    return explicit.replace(/\s+/g, " ").trim().slice(0, 120);
  return String(subject ?? "")
    .toLowerCase()
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * What to call a mailing on screen.
 *
 * The tag is the name the sender gave it. Older rows have no name, so the
 * subject stands in, trimmed of its tokens. Either way the result is short
 * enough to sit on one line next to a candidate's name.
 */
export function mailingName(row: { tag?: string | null; subject?: string | null }): string {
  const raw = (row.tag ?? "").trim() || messageTag(row.subject ?? "");
  if (!raw) return "";
  return raw.length > 48 ? raw.slice(0, 47).trimEnd() + "…" : raw;
}

/**
 * The most recent successful contact for each application and each address.
 *
 * Keyed both ways because a guest applicant has no profile and a registered
 * one may have applied before registering, so neither key alone covers
 * everybody.
 */
export async function fetchContactHistory(
  admin: any,
  opts: { applicationIds?: (string | null | undefined)[]; emails?: (string | null | undefined)[] }
): Promise<ContactHistory> {
  const appIds = Array.from(new Set((opts.applicationIds ?? []).filter(Boolean))) as string[];
  const emails = Array.from(new Set(
    (opts.emails ?? []).filter(Boolean).map((e) => String(e).toLowerCase())
  )) as string[];

  const byApplication = new Map<string, ContactRecord>();
  const byEmail = new Map<string, ContactRecord>();
  if (!appIds.length && !emails.length) return { byApplication, byEmail };

  /**
   * One query per key type rather than one per applicant. A page of 300
   * applicants was never going to survive 300 round trips.
   *
   * Only successful sends count as contact. A failed send means the person
   * has heard nothing, so showing it as "emailed" would be worse than
   * showing nothing: it is the exact case where a resend is wanted.
   *
   * AND ONLY MAIL A PERSON SENT. Every applicant receives an automatic
   * receipt the moment they apply, so counting that would mark the entire
   * list as "emailed" and the column would carry no information at all —
   * which is the same blindness it was built to fix. Human mail is either
   * a campaign (kind 'bulk') or something with a staff member against it
   * (sent_by); receipts and internal staff alerts have neither.
   */
  const humanSent = "sent_by.not.is.null,kind.eq.bulk";
  const queries: Promise<any>[] = [];

  if (appIds.length) {
    queries.push(admin.from("email_log")
      .select("application_id, recipient, subject, kind, status, tag, sent_at")
      .in("application_id", appIds)
      .eq("status", "sent")
      .or(humanSent)
      .order("sent_at", { ascending: false })
      .limit(5000));
  } else queries.push(Promise.resolve({ data: [] }));

  if (emails.length) {
    queries.push(admin.from("email_log")
      .select("application_id, recipient, subject, kind, status, tag, sent_at")
      .in("recipient", emails)
      .eq("status", "sent")
      .or(humanSent)
      .order("sent_at", { ascending: false })
      .limit(5000));
  } else queries.push(Promise.resolve({ data: [] }));

  const [byApp, byAddr] = await Promise.all(queries);

  const fold = (rows: any[], key: (r: any) => string | null, into: Map<string, ContactRecord>) => {
    for (const r of rows ?? []) {
      const k = key(r);
      if (!k) continue;
      const name = mailingName(r);
      const existing = into.get(k);
      if (existing) {
        // Rows arrive newest first, so the first one seen is the latest and
        // everything after it only adds to the count and the mailing list.
        // Each mailing keeps ITS OWN date rather than the person's last
        // contact date, because the two are different questions.
        existing.count += 1;
        if (name && !existing.mailings.some((m) => m.name.toLowerCase() === name.toLowerCase()))
          existing.mailings.push({ name, sentAt: r.sent_at });
        continue;
      }
      into.set(k, {
        sentAt: r.sent_at,
        subject: r.subject ?? "",
        kind: r.kind ?? "bulk",
        status: r.status ?? "sent",
        tag: r.tag ?? null,
        count: 1,
        mailings: name ? [{ name, sentAt: r.sent_at }] : []
      });
    }
  };

  fold((byApp as any).data, (r) => r.application_id, byApplication);
  fold((byAddr as any).data, (r) => String(r.recipient ?? "").toLowerCase(), byEmail);

  return { byApplication, byEmail };
}

/**
 * Every mailing that has gone to this set of applications, newest first.
 *
 * This is what fills the "has not yet had" filter. Built from the same rows
 * the list is built from, so the names in the dropdown are exactly the names
 * shown against the candidates and there is no third source of truth.
 */
export type Mailing = { name: string; sentAt: string; recipients: number };

/**
 * Takes one record per person, already merged by contactFor, rather than the
 * raw history. A person who matches on both their application and their
 * address holds two records in the history and would be counted twice in the
 * same mailing; the merged record is one person, once.
 */
export function mailingsIn(records: (ContactRecord | null)[]): Mailing[] {
  const seen = new Map<string, Mailing>();
  for (const rec of records) {
    if (!rec) continue;
    for (const sent of rec.mailings) {
      const key = sent.name.toLowerCase();
      const m = seen.get(key);
      if (m) {
        m.recipients += 1;
        if (sent.sentAt > m.sentAt) m.sentAt = sent.sentAt;
      } else {
        seen.set(key, { name: sent.name, sentAt: sent.sentAt, recipients: 1 });
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
}

/** The record for one person, whichever key we have for them. */
export function contactFor(
  history: ContactHistory,
  who: { applicationId?: string | null; email?: string | null }
): ContactRecord | null {
  if (who.applicationId) {
    const a = history.byApplication.get(who.applicationId);
    if (a) return a;
  }
  if (who.email) {
    const e = history.byEmail.get(String(who.email).toLowerCase());
    if (e) return e;
  }
  return null;
}

/**
 * Who among these people has already had THIS message.
 *
 * Matched on the tag, which is what makes a repeat recognisable rather than
 * guessed. History recorded before tags existed is matched on the subject
 * instead, which migration 0063 backfills into a tag anyway.
 *
 * Returns lowercased email addresses, because that is the one key every
 * recipient has.
 */
export async function alreadyReceived(
  admin: any,
  people: { applicationId?: string | null; email: string }[],
  subject: string,
  explicitTag?: string | null
): Promise<Set<string>> {
  const tag = messageTag(subject, explicitTag);
  const emails = Array.from(new Set(people.map((p) => p.email.toLowerCase()).filter(Boolean)));
  const out = new Set<string>();
  if (!tag || !emails.length) return out;

  const { data } = await admin.from("email_log")
    .select("recipient, tag, subject")
    .in("recipient", emails)
    .eq("status", "sent")
    .limit(10000);

  for (const r of data ?? []) {
    /**
     * A row is a repeat if EITHER identity matches: the name the mailing was
     * filed under, or the subject it went out with.
     *
     * Matching the name alone left a trap. Name batch one "Office
     * invitation", then send the same subject later without typing a name,
     * and the name no longer matches, the subject is never consulted, and
     * everybody receives it a second time. Matching both closes that, and it
     * cannot produce a false repeat for somebody who has heard nothing,
     * because a person with no history has no rows here at all.
     */
    const rowTags = [r.tag, messageTag(r.subject ?? "")];
    // Case insensitively: a mailing typed as "Office invitation" one week and
    // "office invitation" the next is one mailing, not two.
    const want = tag.toLowerCase();
    if (rowTags.some((t) => (t ?? "").toLowerCase() === want))
      out.add(String(r.recipient ?? "").toLowerCase());
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Phrasing, shared so the list and the composer say the same thing
 * ------------------------------------------------------------------ */

/** "today", "yesterday", "3 days ago", "last month". */
export function howLongAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 62) return "last month";
  return `${Math.floor(days / 30)} months ago`;
}

/** The one line the applicant list shows. */
export function describeContact(rec: ContactRecord | null): string {
  if (!rec) return "Never emailed";
  const when = howLongAgo(rec.sentAt);
  const more = rec.count > 1 ? `, ${rec.count} in total` : "";
  return `Emailed ${when}${more}`;
}
