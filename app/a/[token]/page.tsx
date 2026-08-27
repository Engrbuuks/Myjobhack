import { createAdminClient } from "@/lib/supabase/admin";
import { AnswerButtons } from "@/components/AnswerButtons";

export const dynamic = "force-dynamic";

/**
 * The applicant lands here from their email. No login: the token in the URL
 * IS the credential, and it only ever permits answering one question on one
 * application. Nothing about the candidate is displayed beyond the question
 * itself, so a forwarded link leaks nothing.
 *
 * ?v=<option> answers immediately — that is the one-tap path from the email
 * buttons. Without it, the page shows the options to choose from.
 */
export default async function AnswerPage({
  params, searchParams
}: { params: { token: string }; searchParams: { v?: string } }) {
  const admin = createAdminClient();
  const { data: req } = await admin.from("answer_requests")
    .select("id, application_id, field_id, question, options, answered_at, answered_value")
    .eq("token", params.token).maybeSingle();

  if (!req) {
    return (
      <Shell>
        <h1 className="font-display text-2xl font-semibold mb-2">This link has expired</h1>
        <p className="text-muted">
          It may have already been used, or the question was removed. If you still want to update
          your application, reply to the email we sent you and we&rsquo;ll sort it out.
        </p>
      </Shell>
    );
  }

  const options: string[] = Array.isArray(req.options) ? req.options : [];

  if (req.answered_at) {
    return (
      <Shell>
        <div className="w-14 h-14 rounded-full bg-coral-soft text-coral grid place-items-center text-2xl mx-auto mb-5">✓</div>
        <h1 className="font-display text-2xl font-semibold mb-2">Thank you — that&rsquo;s recorded</h1>
        <p className="text-muted">
          You answered <strong className="text-ink">{req.answered_value}</strong>. Nothing else is needed
          from you. We&rsquo;ll be in touch about your application.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-muted mb-3">One question</p>
      <h1 className="font-display text-2xl font-semibold mb-6">{req.question}</h1>
      <AnswerButtons token={params.token} options={options} auto={searchParams.v} />
      <p className="text-xs text-muted-2 mt-6">
        This updates the application you already submitted. It takes one tap.
      </p>
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
