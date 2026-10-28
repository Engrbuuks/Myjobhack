/**
 * When this person last looked at the Offers page, for the sidebar badge.
 *
 * Kept in a cookie in the browser rather than a column, so the badge needed
 * no migration. The cost is that it is per browser: looking on a phone does
 * not clear the badge on a laptop. For a count of what is new, that is an
 * acceptable trade against another migration in the queue.
 */
export const OFFERS_SEEN_COOKIE = "mjh_offers_seen";

/**
 * The moment to count from. A missing or unreadable cookie counts the last
 * seven days, and anything older than thirty is treated as thirty, so the
 * first visit after a long absence shows a useful number rather than all of
 * history.
 */
export function offersSeenSince(raw: string | undefined | null, now = Date.now()): string {
  const t = raw ? Date.parse(raw) : NaN;
  const floor = now - 30 * 864e5;
  const since = Number.isFinite(t) && t <= now ? Math.max(t, floor) : now - 7 * 864e5;
  return new Date(since).toISOString();
}

/**
 * The PostgREST filter for "responded since": accepted, declined, or expired
 * unanswered, each after the given moment. Shared by the badge and the page,
 * so the number in the sidebar and the rows marked New always agree.
 */
export function respondedSinceFilter(since: string, now = new Date().toISOString()): string {
  return `signed_at.gt.${since},declined_at.gt.${since},and(status.eq.sent,expires_at.gt.${since},expires_at.lte.${now})`;
}

export function respondedSince(o: { signed_at?: string | null; declined_at?: string | null; status?: string; expires_at?: string | null }, since: string, now = Date.now()): boolean {
  const s = Date.parse(since);
  const after = (v?: string | null) => !!v && Date.parse(v) > s;
  return after(o.signed_at) || after(o.declined_at) ||
    (o.status === "sent" && after(o.expires_at) && Date.parse(o.expires_at!) <= now);
}
