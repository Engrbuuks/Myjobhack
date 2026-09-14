import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOfferPdf } from "@/lib/offerLetter";
import { downloadFile, uploadFile } from "@/lib/storage";
import { routeMail } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A candidate accepting or declining their offer.
 *
 * Public by necessity: most candidates have no account. The token is the whole
 * credential, and it permits exactly one thing, on one offer. It returns
 * nothing about the candidate, so a forwarded link leaks nothing beyond what
 * the recipient already has in their inbox.
 *
 * On acceptance a countersigned PDF is generated and stored, so there is a
 * document showing what was agreed rather than only a database flag.
 */
export async function POST(request: Request) {
  const { token, action, full_name, reason } = await request.json().catch(() => ({} as any));
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const admin = createAdminClient();
  const { data: offer } = await admin.from("offer_letters")
    .select("*").eq("sign_token", token).maybeSingle();
  if (!offer) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });

  // Answering twice is a no-op, not an error: people revisit to check.
  if (offer.signed_at || offer.declined_at)
    return NextResponse.json({ ok: true, already: true, status: offer.status });

  if (action === "decline") {
    const declinedAt = new Date().toISOString();
    await admin.from("offer_letters").update({
      status: "declined", declined_at: declinedAt,
      decline_reason: String(reason ?? "").slice(0, 500) || null
    }).eq("id", offer.id);

    /**
     * A decline matters more than an acceptance operationally: the role is
     * open again and nobody is working on it. Telling the people copied in is
     * the difference between refilling next week and discovering it on start
     * day.
     */
    const { data: declSender } = offer.sent_by
      ? await admin.from("profiles").select("email").eq("id", offer.sent_by).maybeSingle()
      : { data: null as any };
    const tell = Array.from(new Set([...(offer.cc_emails ?? []), declSender?.email].filter(Boolean)));

    if (tell.length) {
      const when = new Date(declinedAt).toLocaleDateString("en-GB",
        { day: "numeric", month: "long", year: "numeric" });
      await routeMail(tell.map((to: string) => ({
        to,
        subject: `Offer declined: ${offer.candidate_name}${offer.position_title ? `, ${offer.position_title}` : ""}`,
        html: renderEmail({
          preheader: `${offer.candidate_name} declined on ${when}`,
          kicker: "Offer declined",
          heading: `${offer.candidate_name} has declined`,
          paragraphs: [
            `${offer.candidate_name} declined the offer${offer.position_title ? ` for ${offer.position_title}` : ""} on ${when}.`,
            reason ? `Reason given: ${String(reason).slice(0, 500)}` : "No reason was given.",
            "The position is open again."
          ].filter(Boolean)
        })
      })) as any, { bulk: false }).catch(() => null);
    }

    return NextResponse.json({ ok: true, status: "declined" });
  }

  const typed = String(full_name ?? "").trim();
  if (typed.length < 3)
    return NextResponse.json({ error: "Type your full name to accept." }, { status: 400 });

  const signedAt = new Date().toISOString();

  // Regenerate the letter with the acceptance filled in.
  const { data: lh } = offer.letterhead_id
    ? await admin.from("letterheads").select("*").eq("id", offer.letterhead_id).maybeSingle()
    : { data: null as any };

  const grab = async (path?: string | null, bucket?: string | null, provider?: string | null) => {
    if (!path) return null;
    const r = await downloadFile({
      supabase: admin as any,
      location: { provider: (provider as any) === "supabase" ? "supabase" : "r2",
                  bucket: bucket || process.env.R2_BUCKET || "myjobhack", path }
    }).catch(() => null);
    return r?.buffer ? new Uint8Array(r.buffer) : null;
  };

  let signedPath: string | null = null;
  let signedPdf: Uint8Array | null = null;
  try {
    const pdf = await buildOfferPdf({
      bytes: await grab(lh?.file_path, lh?.file_bucket, lh?.file_provider),
      kind: (lh?.file_kind === "image" ? "image" : "pdf"),
      topMargin: lh?.top_margin_pt ?? 150,
      bottomMargin: lh?.bottom_margin_pt ?? 110,
      signature: await grab(lh?.signature_path, lh?.signature_bucket, lh?.signature_provider),
      signatoryName: lh?.signatory_name ?? "",
      signatoryTitle: lh?.signatory_title ?? ""
    }, {
      candidateName: offer.candidate_name, body: offer.body,
      countersign: true, signedName: typed, signedAt
    });
    signedPdf = pdf;
    const stored = await uploadFile({
      supabase: admin as any, body: Buffer.from(pdf),
      path: `offers/${offer.id}-accepted.pdf`, contentType: "application/pdf"
    });
    signedPath = stored?.location?.path ?? null;
  } catch {
    // The acceptance itself must be recorded even if the document fails.
    signedPath = null;
  }

  await admin.from("offer_letters").update({
    status: "accepted", signed_at: signedAt, signed_name: typed,
    signed_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ...(signedPath ? { pdf_path: signedPath } : {})
  }).eq("id", offer.id);

  // Move the application on, so the pipeline reflects reality.
  if (offer.application_id) {
    await admin.from("applications").update({ status: "hired" }).eq("id", offer.application_id);
  }

  /**
   * Send the countersigned copy to both sides.
   *
   * An acceptance recorded only in the database leaves the candidate with the
   * unsigned letter they were originally sent, and nothing showing they
   * accepted. Both parties should hold the same document, which is the whole
   * point of countersigning.
   */
  if (signedPdf) {
    const when = new Date(signedAt).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric"
    });
    const attachment = [{
      filename: `Offer letter, accepted, ${offer.candidate_name}.pdf`,
      content: Buffer.from(signedPdf).toString("base64")
    }];

    const recipients: string[] = [offer.candidate_email, ...(offer.cc_emails ?? [])];
    // Whoever sent it should know without checking the dashboard.
    const { data: sender } = offer.sent_by
      ? await admin.from("profiles").select("email").eq("id", offer.sent_by).maybeSingle()
      : { data: null as any };
    if (sender?.email && !recipients.includes(sender.email)) recipients.push(sender.email);

    await routeMail(recipients.map((to) => ({
      to,
      subject: `Offer accepted: ${offer.candidate_name}${offer.position_title ? `, ${offer.position_title}` : ""}`,
      html: renderEmail({
        preheader: `${offer.candidate_name} accepted on ${when}`,
        kicker: "Offer accepted",
        heading: to === offer.candidate_email
          ? "Thank you, your acceptance is recorded"
          : `${offer.candidate_name} has accepted`,
        paragraphs: to === offer.candidate_email
          ? [
              `You accepted the offer${offer.position_title ? ` for ${offer.position_title}` : ""} on ${when}.`,
              "The countersigned copy is attached. Keep it for your records.",
              "We will be in touch with what happens next."
            ]
          : [
              `${offer.candidate_name} accepted on ${when}, signing as ${typed}.`,
              "The countersigned copy is attached for your records. Nothing is needed from you."
            ]
      }),
      attachments: attachment
    })) as any, { bulk: false }).catch(() => null);
  }

  return NextResponse.json({ ok: true, status: "accepted" });
}
