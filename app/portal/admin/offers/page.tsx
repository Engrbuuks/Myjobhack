import { PageHeader } from "@/components/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
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
  searchParams?: { q?: string; status?: string };
}) {
  const admin = createAdminClient();

  /**
   * Finding a letter months later is the point of keeping them, so the list
   * searches by name, email or role, and filters by outcome. Commas and
   * brackets are stripped because they are the separators in the query
   * syntax, and a name containing one would otherwise break the search.
   */
  const q = String(searchParams?.q ?? "").replace(/[,()%]/g, " ").trim();
  const status = ["sent", "accepted", "declined"].includes(String(searchParams?.status))
    ? String(searchParams?.status) : "";

  let query = admin.from("offer_letters")
    .select("id, candidate_name, candidate_email, position_title, salary, start_date, status, sent_at, signed_at, signed_name, declined_at, decline_reason, cc_emails, application_id, job_id")
    .order("sent_at", { ascending: false }).limit(300);
  if (q) query = query.or(`candidate_name.ilike.%${q}%,candidate_email.ilike.%${q}%,position_title.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  const { data: offers, error } = await query;

  const tableMissing = error && /does not exist|could not find the table/i.test(error.message);
  const rows = offers ?? [];

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
                  href={on ? `/portal/admin/offers${q ? `?q=${encodeURIComponent(q)}` : ""}`
                           : `/portal/admin/offers?status=${st}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`card p-4 transition hover:border-coral ${on ? "border-coral" : ""}`}>
                  <div className="numeral !text-3xl">{n}</div>
                  <div className="text-sm text-muted-2 mt-1">
                    {label}{on ? ", showing only these" : ""}
                  </div>
                </Link>
              );
            })}
          </div>

          <form method="get" className="flex flex-wrap gap-2 mb-5">
            {status && <input type="hidden" name="status" value={status} />}
            <input className="input !h-10 flex-1 min-w-56" name="q" defaultValue={q}
              placeholder="Search by name, email or role" />
            <button className="btn-coral !h-10" type="submit">Search</button>
            {(q || status) && (
              <Link href="/portal/admin/offers" className="btn-ghost !h-10">Clear</Link>
            )}
          </form>

          {rows.length === 0 ? (
            <div className="card p-6 mb-8 text-sm text-muted">
              {q || status
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
