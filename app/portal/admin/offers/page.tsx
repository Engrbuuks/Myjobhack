import { PageHeader } from "@/components/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { LetterheadManager } from "@/components/LetterheadManager";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Offers issued, and the paper they are printed on.
 *
 * The outstanding count leads, because an offer sent and never answered is
 * the one that costs you a hire. Silence usually means they took something
 * else, and the sooner that is visible the sooner the role can be refilled.
 */
export default async function OffersPage() {
  const admin = createAdminClient();
  const { data: offers, error } = await admin.from("offer_letters")
    .select("id, candidate_name, candidate_email, position_title, salary, start_date, status, sent_at, signed_at, signed_name, declined_at, decline_reason, cc_emails, application_id, job_id")
    .order("sent_at", { ascending: false }).limit(100);

  const tableMissing = error && /does not exist|could not find the table/i.test(error.message);
  const rows = offers ?? [];
  const pending = rows.filter((o: any) => o.status === "sent");
  const accepted = rows.filter((o: any) => o.status === "accepted");
  const declined = rows.filter((o: any) => o.status === "declined");

  const age = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

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
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            {[["Awaiting a reply", pending.length], ["Accepted", accepted.length], ["Declined", declined.length]]
              .map(([label, n]) => (
              <div key={label as string} className="card p-4">
                <div className="numeral !text-3xl">{n as number}</div>
                <div className="text-sm text-muted-2 mt-1">{label as string}</div>
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="card p-6 mb-8 text-sm text-muted">
              No offers issued yet. Open a job&rsquo;s applicants, find someone you have decided
              on, and use the Offer button on their row.
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
                          <span className="font-semibold">{o.candidate_name}</span>
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
                      {o.job_id && (
                        <Link href={`/portal/admin/jobs/${o.job_id}/applicants`}
                          className="btn-ghost !h-9 text-xs shrink-0">
                          Open the job
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

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
