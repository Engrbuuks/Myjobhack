import { createAdminClient } from "@/lib/supabase/admin";
import { UnsubscribeButton } from "@/components/UnsubscribeButton";

export const dynamic = "force-dynamic";

/**
 * Unsubscribe without an account.
 *
 * The List-Unsubscribe header used to point every recipient at /portal/account
 * — a page guest applicants cannot reach, because they never registered. A
 * recipient who cannot unsubscribe marks the message as spam instead, and
 * that harms deliverability for everything the platform sends, including
 * application receipts.
 *
 * The token identifies the address. Nothing else about the person is shown or
 * needed, so a forwarded link reveals nothing.
 */
export default async function UnsubscribePage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const { data: row } = await admin.from("email_optouts")
    .select("email, opted_out_at").eq("token", params.token).maybeSingle();

  if (!row) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold mb-2">This link isn&rsquo;t valid</h1>
        <p className="text-muted">
          It may have been mistyped. If you&rsquo;re still receiving mail you don&rsquo;t want,
          reply to any message from us and we&rsquo;ll remove you.
        </p>
      </Shell>
    );
  }

  const masked = row.email.replace(/^(.).*(@.*)$/, "$1•••$2");

  if (row.opted_out_at) {
    return (
      <Shell>
        <div className="w-14 h-14 rounded-full bg-coral-soft text-coral grid place-items-center text-2xl mx-auto mb-5">✓</div>
        <h1 className="font-display text-2xl font-semibold mb-2">You&rsquo;re unsubscribed</h1>
        <p className="text-muted">
          {masked} won&rsquo;t receive further updates from us. Messages about an application you
          submit in future will still reach you, since those are ones you asked for.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-2xl font-semibold mb-2">Stop receiving these emails?</h1>
      <p className="text-muted mb-6">
        We&rsquo;ll stop sending updates to {masked}. You can still apply for roles, and
        you&rsquo;ll still get confirmations for anything you apply to.
      </p>
      <UnsubscribeButton token={params.token} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center bg-paper px-5 py-16">
      <div className="card p-8 sm:p-10 w-full max-w-md text-center">{children}</div>
    </main>
  );
}
