import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadFile } from "@/lib/storage";
import { renderOfferFromRow } from "@/lib/offerRender";
import { routeMail } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Name parts, lowercased, unaccented, punctuation and titles removed. */
function nameTokens(v: string): string[] {
  return String(v ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|mx|dr|engr|eng|prof|chief|alhaji|alhaja|pastor|rev|barr|hon|sir|madam)\.?\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Does the typed signature belong to the person the offer names?
 *
 * Enough of the stored name must appear, in any order: both parts of a two
 * part name, or half of a longer one. Strict equality would refuse real
 * candidates who leave out a middle name, and no check at all let anyone
 * accept in anyone's name, which is what this replaces.
 */
function nameMatches(typed: string, candidate: string): boolean {
  const want = nameTokens(candidate);
  const got = new Set(nameTokens(typed));
  if (!want.length || !got.size) return false;
  const hits = want.filter((t) => got.has(t)).length;
  const needed = Math.min(want.length, Math.max(2, Math.ceil(want.length / 2)));
  return hits >= needed;
}

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

  /**
   * A link that is no longer live.
   *
   * The token used to have no expiry and no way to cancel it, so a letter
   * forwarded to a colleague, or sitting in an old mailbox, could be accepted
   * months later. An offer is a commitment with a date on it; the link should
   * not outlive it. Both columns arrive in migration 0060 and are treated as
   * absent on an older database rather than blocking acceptance.
   */
  if (offer.withdrawn_at)
    return NextResponse.json({
      error: "This offer has been withdrawn. Please contact the person who sent it."
    }, { status: 410 });

  if (offer.expires_at && new Date(offer.expires_at) < new Date())
    return NextResponse.json({
      error: "This offer link has expired. Reply to the email and a fresh one can be issued."
    }, { status: 410 });

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

  /**
   * The typed signature has to be the candidate's name.
   *
   * It was only checked for length, and whatever was typed went into the
   * countersigned PDF as the signature. So anyone holding a forwarded link
   * could book a hire in any name at all, and the stamped document looked
   * exactly like a real acceptance.
   *
   * The comparison is deliberately forgiving, because a person signing their
   * own offer should not be refused over a middle name or a different order.
   * Tokens are compared without case, accents or punctuation, in any order,
   * and enough of the stored name must appear: both parts of a two part name,
   * or half of a longer one. "Ishola Motunrayo" accepts an offer addressed to
   * "Ishola Motunrayo Oluwabusayomi"; "Not The Candidate" does not.
   */
  if (!nameMatches(typed, offer.candidate_name)) {
    return NextResponse.json({
      error: `To accept, type the name this offer was addressed to: ${offer.candidate_name}. If that name is wrong, reply to the email and ask for a corrected letter rather than signing a different name.`
    }, { status: 400 });
  }

  const signedAt = new Date().toISOString();

  /**
   * Build the countersigned copy with the same renderer the viewer uses, from
   * the stored offer, so it matches the letter that was sent: same date line,
   * same reference, same start position. Only the signature block differs.
   */
  let signedLoc: any = null;
  let signedPdf: Uint8Array | null = null;
  try {
    signedPdf = await renderOfferFromRow(admin, offer, { signed: true, signedName: typed, signedAt });
    const stored = await uploadFile({
      supabase: admin as any, body: Buffer.from(signedPdf),
      path: `offers/${offer.id}-accepted.pdf`, contentType: "application/pdf"
    });
    signedLoc = stored?.location ?? null;
  } catch {
    // The acceptance itself must be recorded even if the document fails. The
    // viewer rebuilds the signed copy from the record when no file exists.
    signedLoc = null;
  }

  // The acceptance first, on its own, so nothing below can prevent it.
  await admin.from("offer_letters").update({
    status: "accepted", signed_at: signedAt, signed_name: typed,
    signed_ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  }).eq("id", offer.id);

  /**
   * The signed copy goes in its own columns, leaving pdf_path as the letter
   * that was sent. Before migration 0057 those columns do not exist, so fall
   * back to the old behaviour rather than lose the signed file.
   */
  if (signedLoc) {
    const { error: sigErr } = await admin.from("offer_letters").update({
      signed_pdf_path: signedLoc.path,
      signed_pdf_bucket: signedLoc.bucket,
      signed_pdf_provider: signedLoc.provider
    }).eq("id", offer.id);
    if (sigErr) {
      await admin.from("offer_letters").update({ pdf_path: signedLoc.path }).eq("id", offer.id);
    }
  }

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
