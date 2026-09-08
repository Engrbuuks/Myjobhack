import { createAdminClient } from "@/lib/supabase/admin";
import { OfferActions } from "@/components/OfferActions";

export const dynamic = "force-dynamic";

/**
 * Where a candidate reads and accepts their offer.
 *
 * No account required. The token in the link is the credential, and it
 * permits acting on this one offer only. Salary and start date are shown
 * because the candidate is being asked to agree to them, and agreeing to
 * something you cannot see is not agreement.
 */
export default async function OfferPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { data: offer } = await admin.from("offer_letters")
    .select("id, candidate_name, position_title, salary, start_date, reporting_to, status, signed_at, signed_name, declined_at")
    .eq("sign_token", params.token).maybeSingle();

  if (!offer) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold mb-2">This link is no longer valid</h1>
        <p className="text-muted">
          It may have been withdrawn or replaced. Reply to the email we sent you and we will
          sort it out.
        </p>
      </Shell>
    );
  }

  if (offer.signed_at) {
    return (
      <Shell>
        <div className="w-14 h-14 rounded-full bg-coral-soft text-coral grid place-items-center text-2xl mx-auto mb-5">✓</div>
        <h1 className="font-display text-2xl font-semibold mb-2">You have accepted this offer</h1>
        <p className="text-muted">
          Accepted on {new Date(offer.signed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} as
          <strong className="text-ink"> {offer.signed_name}</strong>. A countersigned copy is held
          with your offer, and the attachment in your email remains yours to keep.
        </p>
      </Shell>
    );
  }

  if (offer.declined_at) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold mb-2">You declined this offer</h1>
        <p className="text-muted">
          Thank you for letting us know. If that was a mistake, reply to the email we sent you.
        </p>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <p className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Offer of employment</p>
      <h1 className="font-display text-2xl font-semibold mb-5">
        {offer.candidate_name}, here are the terms
      </h1>

      <div className="rounded-card border border-line divide-y divide-line text-left mb-6">
        {[
          ["Position", offer.position_title],
          ["Remuneration", offer.salary],
          ["Start date", offer.start_date
            ? new Date(offer.start_date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
            : ""],
          ["Reporting to", offer.reporting_to]
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={k as string} className="flex justify-between gap-4 px-4 py-3">
            <span className="text-sm text-muted-2">{k}</span>
            <span className="text-sm font-medium text-ink text-right">{v}</span>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-2 mb-5">
        The full letter is attached to the email we sent you. Read it before accepting. Accepting
        here has the same effect as signing and returning the letter.
      </p>

      <OfferActions token={params.token} name={offer.candidate_name} />
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-screen grid place-items-center bg-paper px-5 py-16">
      <div className={`card p-8 sm:p-10 w-full ${wide ? "max-w-lg" : "max-w-md text-center"}`}>{children}</div>
    </main>
  );
}
