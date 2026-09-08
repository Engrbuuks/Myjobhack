import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { buildOfferPdf, renderOfferBody, DEFAULT_OFFER_BODY } from "@/lib/offerLetter";
import { downloadFile, uploadFile } from "@/lib/storage";
import { routeMail } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";
import { logSends } from "@/lib/emailAllowance";
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
  const gate = await requirePermission("applicants.contact");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  const b = await request.json().catch(() => ({} as any));

  const { data: app } = await admin.from("applications")
    .select("id, job_id, talent_id, guest_name, guest_email")
    .eq("id", b.application_id).maybeSingle();
  if (!app) return NextResponse.json({ error: "That application no longer exists." }, { status: 404 });

  const { data: prof } = app.talent_id
    ? await admin.from("profiles").select("full_name, email").eq("id", app.talent_id).maybeSingle()
    : { data: null as any };
  const name = prof?.full_name ?? app.guest_name ?? "Candidate";
  const email = prof?.email ?? app.guest_email ?? "";
  if (!email) return NextResponse.json({ error: "That candidate has no email address on file." }, { status: 400 });

  const { data: job } = await admin.from("jobs")
    .select("title, company_name").eq("id", app.job_id).maybeSingle();

  const { data: lh } = b.letterhead_id
    ? await admin.from("letterheads").select("*").eq("id", b.letterhead_id).maybeSingle()
    : await admin.from("letterheads").select("*").eq("is_default", true).maybeSingle();

  // Fetch the letterhead artwork and the signature image.
  const grab = async (path?: string | null, bucket?: string | null, provider?: string | null) => {
    if (!path) return null;
    const r = await downloadFile({
      supabase: admin as any,
      location: { provider: (provider as any) === "supabase" ? "supabase" : "r2",
                  bucket: bucket || process.env.R2_BUCKET || "myjobhack", path }
    }).catch(() => null);
    return r?.buffer ? new Uint8Array(r.buffer) : null;
  };

  const start = b.start_date
    ? new Date(b.start_date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  const body = renderOfferBody(String(b.body ?? DEFAULT_OFFER_BODY), {
    name, first_name: name.split(" ")[0],
    position: String(b.position ?? job?.title ?? ""),
    salary: String(b.salary ?? ""),
    start_date: start,
    reporting_to: String(b.reporting_to ?? ""),
    company: job?.company_name ?? "MYJOBHACK",
    today: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  });

  const pdf = await buildOfferPdf({
    bytes: await grab(lh?.file_path, lh?.file_bucket, lh?.file_provider),
    kind: (lh?.file_kind === "image" ? "image" : "pdf"),
    topMargin: lh?.top_margin_pt ?? 150,
    bottomMargin: lh?.bottom_margin_pt ?? 110,
    signature: await grab(lh?.signature_path, lh?.signature_bucket, lh?.signature_provider),
    signatoryName: lh?.signatory_name ?? "",
    signatoryTitle: lh?.signatory_title ?? ""
  }, {
    candidateName: name, body,
    dateLine: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    reference: `MJH-OFF-${new Date().getFullYear()}-${String(app.id).slice(0, 6).toUpperCase()}`,
    countersign: b.countersign !== false
  });

  if (b.preview) {
    return NextResponse.json({
      preview: true, candidate: name, to: email,
      pdf_base64: Buffer.from(pdf).toString("base64"),
      warnings: [
        ...(lh ? [] : ["No letterhead is set up, so this letter is on plain paper. Upload one in Settings."]),
        ...(lh && !lh.signature_path ? ["No signature image on the letterhead, so a blank line is left to sign by hand."] : []),
        ...(!b.salary ? ["No salary stated. An offer without one is usually queried immediately."] : []),
        ...(!b.start_date ? ["No start date stated."] : [])
      ]
    });
  }

  // ---- store, record, send ----
  const token = makeToken();
  const stored = await uploadFile({
    supabase: admin as any,
    body: Buffer.from(pdf),
    path: `offers/${app.id}-${Date.now()}.pdf`,
    contentType: "application/pdf"
  }).catch(() => null);

  const cc: string[] = Array.isArray(b.cc)
    ? b.cc.map((x: any) => String(x).trim()).filter((x: string) => x.includes("@")).slice(0, 5)
    : [];

  const { data: row, error } = await admin.from("offer_letters").insert({
    application_id: app.id, job_id: app.job_id, letterhead_id: lh?.id ?? null,
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

  const signUrl = `${APP()}/offer/${token}`;
  const [res] = await routeMail([{
    to: email,
    cc,
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
    attachments: [{
      filename: `Offer letter - ${name}.pdf`,
      content: Buffer.from(pdf).toString("base64")
    }]
  } as any], { bulk: false });

  await logSends(admin, [{
    recipient: email, subject: `Offer of employment: ${b.position ?? job?.title ?? ""}`,
    kind: "transactional", job_id: app.job_id, application_id: app.id,
    sent_by: gate.userId, status: res?.error ? "failed" : "sent",
    error: res?.error ?? null, provider: (res as any)?.provider ?? "resend",
    preview: `Offer letter, ${cc.length ? `cc ${cc.join(", ")}` : "no cc"}`
  }]);

  return NextResponse.json({
    ok: true, offer_id: row.id, sign_url: signUrl,
    message: res?.error
      ? `The offer was saved but the email failed: ${res.error}. Download the PDF and send it by hand.`
      : `Offer letter sent to ${email}${cc.length ? `, copied to ${cc.join(", ")}` : ""}. You will see it here when they accept.`
  });
}
