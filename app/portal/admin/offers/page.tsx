import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";
import { OfferLocationTag } from "@/components/OfferLocationTag";
import { MarkOffersSeen } from "@/components/MarkOffersSeen";
import { cookies } from "next/headers";
import { OFFERS_SEEN_COOKIE, offersSeenSince, respondedSince } from "@/lib/offerSeen";
import { UNTAGGED, type OfferLocation } from "@/lib/offerLocations";
import { readOfferFilters, applyOfferFilters, offerFilterQuery, offerOutcome } from "@/lib/offerFilters";
import { LetterheadManager } from "@/components/LetterheadManager";
import { BulkOffers } from "@/components/BulkOffers";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Offers issued, and the paper they are printed on.
 *
 * The outstanding count leads, because an offer sent and never answered is
 * the one that costs you a hire. Silence usually means they took something
 * else, and the sooner that is visible the sooner the role can be refilled.
 */
export default async function OffersPage({ searchParams }: {
  searchParams?: { q?: string; status?: string; loc?: string };
}) {
  /**
   * Checked here, not left to the layout.
   *
   * Everything below reads with the service role, which ignores row level
   * security, and this page shows salaries and candidate identities. The
   * layout only checks for a staff role; the capability is the same one the
   * offer route and the file route require, so a person who cannot issue or
   * open an offer cannot list them either.
   */
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const { data: me } = user
    ? await admin.from("profiles").select("role, permissions").eq("id", user.id).maybeSingle()
    : { data: null as any };
  if (!can(me, "applicants.contact"))
    return (
      <PageHeader title="Offers"
        sub="You do not have permission to see offer letters. Ask an administrator for applicant contact access." />
    );

  /**
   * Finding a letter months later is the point of keeping them, so the list
   * searches by name, email or role, and filters by outcome and location.
   */
  const filters = readOfferFilters(searchParams ?? {});
  const { q, status, loc } = filters;

  const COLS = "id, candidate_name, candidate_email, position_title, salary, start_date, status, sent_at, signed_at, signed_name, declined_at, decline_reason, cc_emails, application_id, job_id, expires_at";
  const listQuery = (withLocation: boolean) => applyOfferFilters(
    admin.from("offer_letters")
      .select(withLocation ? `${COLS}, location_id` : COLS)
      .order("sent_at", { ascending: false }).limit(300),
    filters, withLocation);

  /**
   * Locations arrive with migration 0065. Until it is run the page must keep
   * working exactly as before, so a missing column drops back to the old
   * query and says what to run, instead of reporting that offers are gone.
   */
  let { data: offers, error } = await listQuery(true);
  let locationsReady = true;
  if (error && /location_id/.test(error.message)) {
    locationsReady = false;
    ({ data: offers, error } = await listQuery(false));
  }

  const tableMissing = error && /does not exist|could not find the table/i.test(error.message);
  const rows = (offers ?? []) as any[];

  // Totals across every offer, not just the filtered list, so the figures do
  // not change meaning when you search.
  const countOf = async (st: string) => {
    const { count } = await admin.from("offer_letters")
      .select("id", { count: "exact", head: true }).eq("status", st);
    return count ?? 0;
  };
  const [pendingCount, acceptedCount, declinedCount] = tableMissing
    ? [0, 0, 0]
    : await Promise.all([countOf("sent"), countOf("accepted"), countOf("declined")]);

  /**
   * Offers per location, by outcome, from the 0065 view. Counted in the
   * database rather than from the 300 rows on screen, so the numbers are
   * the whole history and do not shift with the search box.
   */
  type Summary = { location_id: string | null; location_name: string | null; sent: number;
    accepted: number; declined: number; withdrawn: number; expired: number; awaiting: number };
  let summary: Summary[] = [];
  let locations: OfferLocation[] = [];
  if (locationsReady && !tableMissing) {
    const [{ data: sum, error: sumErr }, { data: locs }] = await Promise.all([
      admin.from("offer_location_summary").select("*"),
      admin.from("offer_locations").select("id, name").order("name")
    ]);
    if (sumErr) locationsReady = false;
    summary = ((sum ?? []) as Summary[])
      .map((r) => ({ ...r, sent: Number(r.sent), accepted: Number(r.accepted), declined: Number(r.declined),
        withdrawn: Number(r.withdrawn), expired: Number(r.expired), awaiting: Number(r.awaiting) }))
      // Busiest first, with Not tagged always last so it never reads as a place.
      .sort((a, b) => (a.location_id ? 0 : 1) - (b.location_id ? 0 : 1) || b.sent - a.sent);
    locations = (locs ?? []) as OfferLocation[];
  }
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const countFor = (id: string | null) => summary.find((r) => (r.location_id ?? null) === id)?.sent ?? 0;
  const allSent = summary.reduce((n, r) => n + r.sent, 0);
  const href = (f: Partial<typeof filters>) => `/portal/admin/offers${offerFilterQuery(f)}`;

  // What counts as new on this visit: the same rule as the sidebar badge.
  // The visit is recorded after the page renders, so these stay marked
  // while you read them.
  const seenSince = offersSeenSince(cookies().get(OFFERS_SEEN_COOKIE)?.value);
  const newCount = rows.filter((o) => respondedSince(o, seenSince)).length;

  const fileUrl = (id: string, copy: "signed" | "sent", download = false) =>
    `/api/admin/offer/file?id=${id}&copy=${copy}${download ? "&download=1" : ""}`;

  const age = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  const { data: letterheads } = await admin.from("letterheads")
    .select("id, name, is_default").order("is_default", { ascending: false });

  return (
    <>
      <PageHeader title="Offers"
        sub="Letters issued, who has accepted, and the letterhead they are printed on." />
      <MarkOffersSeen />
      {newCount > 0 && (
        <p className="text-sm text-ink mb-4">
          <strong>{newCount}</strong> new {newCount === 1 ? "response" : "responses"} since you last
          looked, marked <span className="rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-wide bg-ink text-white">new</span> below.
          Responses are no longer emailed as they happen; a summary goes out each morning.
        </p>
      )}

      {tableMissing ? (
        <div className="card p-6 mb-8">
          <p className="text-sm text-muted">
            The offer tables do not exist yet. Run migration 0055_offer_letters.sql in the
            Supabase SQL editor, then reload this page.
          </p>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            {([["Awaiting a reply", pendingCount, "sent"], ["Accepted", acceptedCount, "accepted"],
               ["Declined", declinedCount, "declined"]] as const).map(([label, n, st]) => {
              const on = status === st;
              return (
                <Link key={st}
                  href={href({ q, loc, status: on ? "" : st })}
                  className={`card p-4 transition hover:border-coral ${on ? "border-coral" : ""}`}>
                  <div className="numeral !text-3xl">{n}</div>
                  <div className="text-sm text-muted-2 mt-1">
                    {label}{on ? ", showing only these" : ""}
                  </div>
                </Link>
              );
            })}
          </div>

          {!locationsReady ? (
            <div className="card p-4 mb-4 text-sm text-muted">
              Offers can be tagged to a location once migration 0065_offer_locations.sql is run in
              the Supabase SQL editor. Until then everything here works as before, untagged.
            </div>
          ) : summary.length > 0 && (
            /* Sent per location, and what became of them. "Sent 12" says little
               on its own; "sent 12, five accepted" is the number that matters. */
            <div className="card p-4 mb-4 overflow-x-auto">
              <div className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
                By location
              </div>
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-left text-xs text-muted-2">
                    <th className="font-medium py-1 pr-3">Location</th>
                    <th className="font-medium py-1 px-2 text-right">Sent</th>
                    <th className="font-medium py-1 px-2 text-right">Accepted</th>
                    <th className="font-medium py-1 px-2 text-right">Declined</th>
                    <th className="font-medium py-1 px-2 text-right">Expired</th>
                    <th className="font-medium py-1 px-2 text-right">Awaiting</th>
                    <th className="font-medium py-1 pl-2 text-right">Withdrawn</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r) => {
                    const key = r.location_id ?? UNTAGGED;
                    const on = loc === key;
                    return (
                      <tr key={key} className={`border-t border-line ${on ? "bg-coral-soft" : ""}`}>
                        <td className="py-1.5 pr-3">
                          <Link href={href({ q, status, loc: on ? "" : key })}
                            className={`hover:text-coral underline decoration-line underline-offset-4 ${
                              r.location_id ? "font-semibold" : "text-muted-2 italic"}`}>
                            {r.location_id ? (r.location_name ?? "Unnamed") : "Not tagged"}
                          </Link>
                        </td>
                        <td className="py-1.5 px-2 text-right font-semibold">{r.sent}</td>
                        <td className="py-1.5 px-2 text-right">{r.accepted}</td>
                        <td className="py-1.5 px-2 text-right">{r.declined}</td>
                        <td className="py-1.5 px-2 text-right">{r.expired}</td>
                        <td className="py-1.5 px-2 text-right">{r.awaiting}</td>
                        <td className="py-1.5 pl-2 text-right">{r.withdrawn}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <form method="get" className="flex flex-wrap gap-2 mb-5">
            {status && <input type="hidden" name="status" value={status} />}
            <input className="input !h-10 flex-1 min-w-56" name="q" defaultValue={q}
              placeholder="Search by name, email or role" />
            {locationsReady && (
              <select className="input !h-10 text-sm w-auto" name="loc" defaultValue={loc}
                aria-label="Location">
                <option value="">All locations · {allSent}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} · {countFor(l.id)}</option>
                ))}
                <option value={UNTAGGED}>Not tagged · {countFor(null)}</option>
              </select>
            )}
            <button className="btn-coral !h-10" type="submit">Search</button>
            {(q || status || loc) && (
              <Link href="/portal/admin/offers" className="btn-ghost !h-10">Clear</Link>
            )}
            {/* The list as filtered, with every column, for pivoting outside the app.
                Not capped at the 300 shown here. */}
            <a href={`/api/admin/offer/export${offerFilterQuery(filters)}`}
              className="btn-ghost !h-10">Export CSV</a>
          </form>

          {rows.length === 0 ? (
            <div className="card p-6 mb-8 text-sm text-muted">
              {q || status || loc
                ? "No offers match that. Clear the search to see them all."
                : "No offers issued yet. Open a job\u2019s applicants, find someone you have decided on, and use the Offer button on their row."}
            </div>
          ) : (
            <div className="space-y-2 mb-10">
              {rows.map((o: any) => {
                const days = o.sent_at ? age(o.sent_at) : 0;
                const stale = o.status === "sent" && days >= 5;
                return (
                  <div key={o.id} className={`card p-4 ${stale ? "border-coral/40" : ""}`}
                    style={stale ? { background: "#FFF4F2" } : undefined}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex-1 min-w-56">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* The name opens the most useful copy: signed when there is
                              one, otherwise the letter as it went out. */}
                          <a href={fileUrl(o.id, o.signed_at ? "signed" : "sent")}
                            target="_blank" rel="noopener"
                            className="font-semibold hover:text-coral underline decoration-line underline-offset-4"
                            title={o.signed_at ? "Open the signed offer letter" : "Open the letter as sent"}>
                            {o.candidate_name}
                          </a>
                          {respondedSince(o, seenSince) && (
                            <span className="rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-wide bg-ink text-white">
                              new
                            </span>
                          )}
                          <span className={`rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                            o.status === "accepted" ? "bg-coral text-white"
                            : o.status === "declined" ? "bg-paper-2 text-muted-2"
                            : "bg-coral-soft text-coral"}`}>
                            {o.status}
                          </span>
                          {o.cc_emails?.length > 0 && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-2">
                              cc {o.cc_emails.length}
                            </span>
                          )}
                          {locationsReady && (
                            <OfferLocationTag offerId={o.id} locations={locations}
                              current={o.location_id
                                ? { id: o.location_id, name: locationName.get(o.location_id) ?? "Unnamed" }
                                : null} />
                          )}
                        </div>
                        <div className="text-sm text-muted-2 mt-1">
                          {[o.position_title, o.salary,
                            o.start_date && `starts ${new Date(o.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`]
                            .filter(Boolean).join(" · ")}
                        </div>
                        <div className="text-xs text-muted-2 mt-1">
                          {o.signed_at
                            ? `Accepted by ${o.signed_name} on ${new Date(o.signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`
                            : o.declined_at
                              ? `Declined on ${new Date(o.declined_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}${o.decline_reason ? `: ${o.decline_reason}` : ""}`
                              : offerOutcome(o) === "expired"
                                ? `Sent ${days} day${days === 1 ? "" : "s"} ago, expired unanswered`
                                : `Sent ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}${stale ? ", no reply yet" : ""}`}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {o.signed_at && (
                          <>
                            <a href={fileUrl(o.id, "signed")} target="_blank" rel="noopener"
                              className="btn-coral !h-9 text-xs">Signed copy</a>
                            <a href={fileUrl(o.id, "signed", true)}
                              className="btn-ghost !h-9 text-xs" title="Download the signed copy">
                              Download
                            </a>
                          </>
                        )}
                        <a href={fileUrl(o.id, "sent")} target="_blank" rel="noopener"
                          className="btn-ghost !h-9 text-xs">Letter as sent</a>
                        {o.job_id && (
                          <Link href={`/portal/admin/jobs/${o.job_id}/applicants`}
                            className="btn-ghost !h-9 text-xs">
                            Open the job
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="border-t border-line pt-8 mb-10">
        <BulkOffers letterheads={(letterheads ?? []) as any} />
      </div>

      <div className="border-t border-line pt-8">
        <h2 className="font-display font-semibold text-xl mb-1">Letterheads</h2>
        <p className="text-sm text-muted-2 mb-4">
          The company paper offers are printed on, and the signature that appears above the
          signatory&rsquo;s name.
        </p>
        <LetterheadManager />
      </div>
    </>
  );
}
