import { UNTAGGED } from "@/lib/offerLocations";

/**
 * The Offers page's filters, read once and applied the same way by the page
 * and its export, so the file always holds exactly the list on screen.
 */
export type OfferFilters = { q: string; status: string; loc: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readOfferFilters(p: { q?: string | null; status?: string | null; loc?: string | null }): OfferFilters {
  // Commas and brackets are the separators in the query syntax, and a name
  // containing one would otherwise break the search.
  const q = String(p.q ?? "").replace(/[,()%]/g, " ").trim();
  const status = ["sent", "accepted", "declined"].includes(String(p.status)) ? String(p.status) : "";
  // Only a uuid or the untagged marker reaches the query, never raw text.
  const raw = String(p.loc ?? "");
  const loc = raw === UNTAGGED || UUID.test(raw) ? raw : "";
  return { q, status, loc };
}

export function applyOfferFilters<T>(query: T, f: OfferFilters, withLocation = true): T {
  let qy: any = query;
  if (f.q) qy = qy.or(`candidate_name.ilike.%${f.q}%,candidate_email.ilike.%${f.q}%,position_title.ilike.%${f.q}%`);
  if (f.status) qy = qy.eq("status", f.status);
  if (withLocation && f.loc) qy = f.loc === UNTAGGED ? qy.is("location_id", null) : qy.eq("location_id", f.loc);
  return qy;
}

/** The query string for a set of filters, leaving out what is empty. */
export function offerFilterQuery(f: Partial<OfferFilters>): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.status) sp.set("status", f.status);
  if (f.loc) sp.set("loc", f.loc);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * The outcome as a person would describe it.
 *
 * "expired" is not a stored status: an offer past its deadline with no answer
 * still reads 'sent'. This is the same rule the signing page uses to refuse
 * the link, and the same rule the summary view counts by.
 */
export function offerOutcome(o: { status: string; expires_at?: string | null }): string {
  if (o.status === "sent" && o.expires_at && new Date(o.expires_at).getTime() < Date.now()) return "expired";
  return o.status === "sent" ? "awaiting reply" : o.status;
}
