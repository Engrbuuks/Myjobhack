import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { buildOfferPdf, renderOfferBody, DEFAULT_OFFER_BODY } from "@/lib/offerLetter";
import { downloadFile, uploadFile } from "@/lib/storage";
import { routeMail } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";
import { logSends, getAllowance } from "@/lib/emailAllowance";
import { makeToken } from "@/lib/resumeScan";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

/**
 * Issue an offer letter.
 *
 * POST { application_id, letterhead_id, body, position, salary, start_date,
 *        reporting_to, cc, preview }
 *
 * preview returns the PDF as base64 and sends nothing. An offer letter states
 * someone's salary and start date, so it is checked before it leaves.
 */
export async function POST(request: Request) {
  try {
    return await handleOffer(request);
  } catch (e: any) {
    /**
     * Anything unhandled still leaves as JSON. A thrown error returned an
     * HTML error page, which the client could only report as a generic
     * failure, so the Preview button looked like it did nothing at all.
     */
    return NextResponse.json({
      error: `Building the letter failed: ${e?.message ?? "unknown error"}`
    }, { status: 500 });
  }
}

async function handleOffer(request: Request) {
  const gate = await requirePermission("applicants.contact");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  const b = await request.json().catch(() => ({} as any));

  /**
   * Two ways in.
   *
   * Most offers go to someone who applied, and their details come from the
   * application. But plenty of hires never touch the site: a referral, a
   * walk in, someone from a previous round. Those are given directly, so the
   * offer system is not limited to people who happened to use the form.
   */
  let app: any = null;
  let name = String(b.recipient_name ?? "").trim();
  let email = String(b.recipient_email ?? "").trim();
  let jobId: string | null = b.job_id ?? null;

  if (b.application_id) {
    const { data: found } = await admin.from("applications")
      .select("id, job_id, talent_id, guest_name, guest_email")
      .eq("id", b.application_id).maybeSingle();
    if (!found) return NextResponse.json({ error: "That application no longer exists." }, { status: 404 });
    app = found;
    jobId = found.job_id;

    const { data: prof } = found.talent_id
      ? await admin.from("profiles").select("full_name, email").eq("id", found.talent_id).maybeSingle()
      : { data: null as any };
    name = prof?.full_name ?? found.guest_name ?? "Candidate";
    email = prof?.email ?? found.guest_email ?? "";
  }

  if (!name) return NextResponse.json({ error: "A name is required on the letter." }, { status: 400 });
  if (!email.includes("@"))
    return NextResponse.json({ error: `No usable email address for ${name}.` }, { status: 400 });

  const { data: job } = jobId
    ? await admin.from("jobs").select("title, company_name").eq("id", jobId).maybeSingle()
    : { data: null as any };

  const { data: lh } = b.letterhead_id
    ? await admin.from("letterheads").select("*").eq("id", b.letterhead_id).maybeSingle()
    : await admin.from("letterheads").select("*").eq("is_default", true).maybeSingle();

  // Fetch the letterhead artwork and the signature image.
  /**
   * Fetch a stored file, but never hang on it.
   *
   * A storage call with no deadline is how one request ate the whole function
   * budget and came back as "the server took too long" with nothing to act
   * on. A letterhead that cannot be fetched in ten seconds is a problem worth
   * reporting, not worth waiting on: the letter can still be produced on
   * plain paper, which is better than no letter at all.
   */
  const grabWarnings: string[] = [];
  const grab = async (path?: string | null, bucket?: string | null, provider?: string | null, what = "file") => {
    if (!path) return null;
    try {
      const r = await Promise.race([
        downloadFile({
          supabase: admin as any,
          location: { provider: (provider as any) === "supabase" ? "supabase" : "r2",
                      bucket: bucket || process.env.R2_BUCKET || "myjobhack", path }
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error(`${what} took longer than 10 seconds to fetch`)), 10_000))
      ]);
      return (r as any)?.buffer ? new Uint8Array((r as any).buffer) : null;
    } catch (e: any) {
      grabWarnings.push(`${what}: ${e?.message ?? "could not be fetched"}`);
      return null;
    }
  };

  /**
   * Whose company is making the offer.
   *
   * The letterhead decides, because the letter is printed on that company's
   * paper: a letter on Eppme letterhead that calls itself MYJOBHACK is wrong
   * on its face. The job's own company name comes next, for a role posted by
   * an employer with no letterhead set up, and MYJOBHACK only when neither
   * says otherwise.
   *
   * An explicit value on the request wins over all of it, for the case where
   * the registered name differs from the letterhead's label.
   */
  const companyName =
    String(b.company ?? "").trim() ||
    lh?.name?.trim() ||
    job?.company_name?.trim() ||
    "MYJOBHACK";

  const start = b.start_date
    ? new Date(b.start_date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const body = renderOfferBody(String(b.body ?? DEFAULT_OFFER_BODY), {
    name, first_name: name.split(" ")[0],
    position: String(b.position ?? job?.title ?? ""),
    salary: String(b.salary ?? ""),
    start_date: start,
    reporting_to: String(b.reporting_to ?? ""),
    company: companyName,
    today: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  });

  // In parallel. Sequentially these were two round trips before the PDF even
  // started building.
  const [paperBytes, sigBytes] = await Promise.all([
    grab(lh?.file_path, lh?.file_bucket, lh?.file_provider, "letterhead"),
    grab(lh?.signature_path, lh?.signature_bucket, lh?.signature_provider, "signature")
  ]);

  // Kept as values so they can be stored with the offer, and the signed copy
  // rebuilt later carries exactly the same date and reference.
  const dateLine = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const reference = `MJH-OFF-${new Date().getFullYear()}-${String(app?.id ?? email).slice(0, 6).toUpperCase()}`;

  const pdf = await buildOfferPdf({
    bytes: paperBytes,
    kind: (lh?.file_kind === "image" ? "image" : "pdf"),
    topMargin: lh?.top_margin_pt ?? 150,
    bottomMargin: lh?.bottom_margin_pt ?? 110,
    signature: sigBytes,
    signatoryName: lh?.signatory_name ?? "",
    signatoryTitle: lh?.signatory_title ?? ""
  }, {
    candidateName: name, body,
    dateLine, reference,
    countersign: b.countersign !== false,
    startOffset: Number(b.start_offset) || 0
  });

  if (b.preview) {
    return NextResponse.json({
      preview: true, candidate: name, to: email,
      pdf_base64: Buffer.from(pdf).toString("base64"),
      company: companyName,
      warnings: [
        ...((pdf as any).warnings ?? []),
        ...grabWarnings,
        ...(lh ? [] : ["No letterhead is set up, so this letter is on plain paper. Upload one in Settings."]),
        ...(lh && !lh.signature_path ? ["No signature image on the letterhead, so a blank line is left to sign by hand."] : []),
        ...(!b.salary ? ["No salary stated. An offer without one is usually queried immediately."] : []),
        ...(!b.start_date ? ["No start date stated."] : [])
      ]
    });
  }

  /**
   * Refuse rather than half send.
   *
   * An offer that generates a PDF, stores it and records a row but never
   * reaches the candidate is worse than one not attempted: the dashboard says
   * sent, and nobody follows up. So the allowance is checked before anything
   * is written.
   */
  const allowance = await getAllowance(admin);
  if (allowance.remaining <= 0)
    return NextResponse.json({
      error: `Today's email allowance is used up, ${allowance.sent_today} of ${allowance.cap} sent. Nothing was created for ${name}. It resets at midnight, and anyone already sent is skipped if you run this again.`,
      allowance
    }, { status: 429 });

  // ---- store, record, send ----
  const token = makeToken();
  /**
   * Storing the copy is useful but not essential. If it hangs, the candidate
   * still gets their letter: the PDF is already built and is attached to the
   * email from memory, not from storage.
   */
  const stored = await Promise.race([
    uploadFile({
      supabase: admin as any,
      body: Buffer.from(pdf),
      path: `offers/${app?.id ?? "direct"}-${Date.now()}.pdf`,
      contentType: "application/pdf"
    }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000))
  ]);

  const cc: string[] = Array.isArray(b.cc)
    ? b.cc.map((x: any) => String(x).trim()).filter((x: string) => x.includes("@")).slice(0, 5)
    : [];

  const { data: row, error } = await admin.from("offer_letters").insert({
    application_id: app?.id ?? null, job_id: jobId, letterhead_id: lh?.id ?? null,
    candidate_name: name, candidate_email: email, body,
    position_title: String(b.position ?? job?.title ?? ""),
    salary: String(b.salary ?? ""), start_date: b.start_date || null,
    reporting_to: String(b.reporting_to ?? ""),
    pdf_path: stored?.location?.path ?? null,
    pdf_bucket: stored?.location?.bucket ?? null,
    pdf_provider: stored?.location?.provider ?? "r2",
    cc_emails: cc, sign_token: token, status: "sent",
    sent_at: new Date().toISOString(), sent_by: gate.userId
  }).select("id").single();

  if (error) {
    const missing = /relation .* does not exist|could not find the table/i.test(error.message);
    return NextResponse.json({
      error: missing
        ? "The offer_letters table doesn't exist yet. Run migration 0055_offer_letters.sql."
        : error.message
    }, { status: missing ? 400 : 500 });
  }

  /**
   * Stored in a separate write, and failure is ignored on purpose: these
   * columns arrive with migration 0057, and an offer must still go out on a
   * database that has not had it yet. Without them the signed copy falls
   * back to the send date and simply omits the reference.
   */
  await admin.from("offer_letters").update({
    reference, date_line: dateLine, start_offset: Number(b.start_offset) || 0,
    company_name: companyName
  }).eq("id", row.id).then(() => null, () => null);

  const signUrl = `${APP()}/offer/${token}`;
  const attachment = [{
    filename: `Offer letter - ${name}.pdf`,
    content: Buffer.from(pdf).toString("base64")
  }];

  /**
   * The candidate and the people copied in get DIFFERENT emails.
   *
   * Copying someone on the candidate's message would hand them the acceptance
   * link too, and that link is not tied to who opens it: a manager clicking
   * Accept would be recorded as the candidate's signature. People copied in
   * are there to know a hire is happening, not to act on it, so they receive
   * the letter for their records and no way to accept or decline.
   *
   * They are told separately when it is signed.
   */
  const [res] = await routeMail([{
    to: email,
    subject: `Offer of employment: ${b.position ?? job?.title ?? "your application"}`,
    html: renderEmail({
      preheader: "Your offer letter is attached",
      kicker: "Offer of employment",
      heading: `${name.split(" ")[0]}, we are pleased to offer you the role`,
      paragraphs: [
        `Your offer letter is attached to this email as a PDF.`,
        `Please read it, then accept or decline using the button below. You can also print it, sign it by hand and return it to us.`
      ],
      cta: { label: "Read and accept your offer", url: signUrl }
    }),
    attachments: attachment
  } as any], { bulk: false });

  // Observers: same letter, no acceptance link.
  if (cc.length) {
    await routeMail(cc.map((to) => ({
      to,
      subject: `For your records: offer issued to ${name}${b.position ? `, ${b.position}` : ""}`,
      html: renderEmail({
        preheader: `${name} has been sent an offer`,
        kicker: "Offer issued",
        heading: `An offer has gone to ${name}`,
        paragraphs: [
          `${name} has been sent an offer${b.position ? ` for ${b.position}` : ""}${b.salary ? ` at ${b.salary}` : ""}${b.start_date ? `, starting ${start}` : ""}.`,
          "A copy of the letter is attached for your records.",
          "You will be told again when they accept or decline. Nothing is needed from you."
        ]
      }),
      attachments: attachment
    })) as any, { bulk: false }).catch(() => null);
  }

  await logSends(admin, [{
    recipient: email, subject: `Offer of employment: ${b.position ?? job?.title ?? ""}`,
    kind: "transactional", job_id: jobId, application_id: app?.id ?? null,
    sent_by: gate.userId, status: res?.error ? "failed" : "sent",
    error: res?.error ?? null, provider: (res as any)?.provider ?? "resend",
    preview: `Offer letter, ${cc.length ? `cc ${cc.join(", ")}` : "no cc"}`
  }]);

  const after = await getAllowance(admin);
  return NextResponse.json({
    ok: true, offer_id: row.id, sign_url: signUrl, allowance: after,
    warnings: grabWarnings,
    message: res?.error
      ? `The offer was saved but the email failed: ${res.error}. Download the PDF and send it by hand.`
      : `Offer letter sent to ${email}${cc.length ? `, copied to ${cc.join(", ")}` : ""}.` +
        (grabWarnings.length ? ` Note: ${grabWarnings.join("; ")}.` : "") +
        (!stored ? " The stored copy could not be saved, but the letter was delivered." : "")
  });
}
