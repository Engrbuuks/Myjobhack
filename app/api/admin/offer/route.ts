import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { buildOfferPdf, renderOfferBody, DEFAULT_OFFER_BODY } from "@/lib/offerLetter";
import { downloadFile, uploadFile } from "@/lib/storage";
import { routeMail } from "@/lib/mailRouter";
import { renderEmail } from "@/lib/email";
import { logSends, getAllowance } from "@/lib/emailAllowance";
import { makeToken } from "@/lib/resumeScan";
import { readDate } from "@/lib/recipientCsv";
import { findOrAddLocation, locationKey, missingTable, tidyLocationName } from "@/lib/offerLocations";

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
/**
 * Withdraw an offer, so its signing link stops working.
 *
 * PATCH { offer_id, reason? }
 *
 * There was no way to do this. Once a letter was sent its token was valid
 * indefinitely, so an offer the business had moved on from could still be
 * accepted, and that acceptance moved the application to hired and emailed a
 * countersigned PDF to everyone copied in. Withdrawing keeps the record, which
 * is what you need if the candidate turns up quoting the letter.
 */
export async function PATCH(request: Request) {
  const gate = await requirePermission("applicants.contact");
  if (!gate.ok) return gate.response;

  const b = await request.json().catch(() => ({} as any));
  const id = String(b.offer_id ?? "");
  if (!id) return NextResponse.json({ error: "Which offer? None was named." }, { status: 400 });

  const admin = createAdminClient();

  if (b.action === "tag") return tagLocation(admin, id, b, gate.userId);
  const { data: offer } = await admin.from("offer_letters")
    .select("id, candidate_name, signed_at, declined_at, withdrawn_at").eq("id", id).maybeSingle();
  if (!offer) return NextResponse.json({ error: "That offer no longer exists." }, { status: 404 });

  if (offer.signed_at)
    return NextResponse.json({
      error: `${offer.candidate_name} has already accepted this offer, so it cannot be withdrawn here. That is a conversation, not a button.`
    }, { status: 409 });
  if (offer.declined_at)
    return NextResponse.json({ ok: true, already: true, message: "That offer was already declined." });
  if (offer.withdrawn_at)
    return NextResponse.json({ ok: true, already: true, message: "That offer was already withdrawn." });

  const { error } = await admin.from("offer_letters").update({
    status: "withdrawn",
    withdrawn_at: new Date().toISOString(),
    withdrawn_by: gate.userId,
    // The token is cleared as well as dated, so even a mistaken expiry check
    // cannot let the old link through.
    sign_token: null
  }).eq("id", id);

  if (error) {
    const missing = /withdrawn_at|withdrawn_by/.test(error.message);
    return NextResponse.json({
      error: missing
        ? "Withdrawing an offer needs migration 0060_guest_placements_and_offer_expiry.sql. Run it in the Supabase SQL editor, then try again."
        : error.message
    }, { status: missing ? 400 : 500 });
  }

  await admin.from("activity_log").insert({
    actor_id: gate.userId, action: "Offer withdrawn", entity: "offer", entity_id: id,
    meta: { candidate: offer.candidate_name, reason: String(b.reason ?? "").slice(0, 300) || null }
  });

  return NextResponse.json({
    ok: true,
    message: `The offer to ${offer.candidate_name} is withdrawn and its signing link no longer works. They have not been told, so send them a note if they are expecting it.`
  });
}

/**
 * Tag an offer with its location after it was sent.
 *
 * PATCH { offer_id, action: "tag", location_id | location_name | null }
 *
 * For offers sent before locations existed, which are left untagged rather
 * than guessed. This records where the offer was for; it does not touch the
 * letter, which went out as it was and stays that way. A change of an
 * existing tag is logged with both values, so a count that moves can be
 * explained.
 */
async function tagLocation(admin: any, id: string, b: any, userId: string) {
  const { data: offer, error: readErr } = await admin.from("offer_letters")
    .select("id, candidate_name, location_id").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ error: missingTable(readErr.message) }, { status: 400 });
  if (!offer) return NextResponse.json({ error: "That offer no longer exists." }, { status: 404 });

  let locationId: string | null = null;
  let locationName: string | null = null;
  if (b.location_id) {
    const { data: loc } = await admin.from("offer_locations")
      .select("id, name").eq("id", String(b.location_id)).maybeSingle();
    if (!loc) return NextResponse.json({ error: "That location is not in the list any more. Reload and pick again." }, { status: 400 });
    locationId = loc.id; locationName = loc.name;
  } else if (b.location_name) {
    const r = await findOrAddLocation(admin, String(b.location_name), userId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    locationId = r.location.id; locationName = r.location.name;
  }

  if ((offer.location_id ?? null) === locationId)
    return NextResponse.json({ ok: true, already: true, message: "No change." });

  const { error } = await admin.from("offer_letters").update({ location_id: locationId }).eq("id", id);
  if (error) return NextResponse.json({ error: missingTable(error.message) }, { status: 400 });

  await admin.from("activity_log").insert({
    actor_id: userId, action: "Offer location tagged", entity: "offer", entity_id: id,
    meta: { candidate: offer.candidate_name, from: offer.location_id ?? null, to: locationId }
  });

  return NextResponse.json({
    ok: true, location_id: locationId,
    message: locationName
      ? `${offer.candidate_name}'s offer is tagged to ${locationName}. The letter itself is unchanged.`
      : `${offer.candidate_name}'s offer is no longer tagged.`
  });
}

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

  /**
   * The start date is checked here, not trusted from the client.
   *
   * A malformed value used to go straight into the insert, and the database
   * answered with "date/time field value out of range", which says nothing
   * about which field or why. Reading it here means a bad date is refused
   * with the value named, before anything is generated, stored or sent.
   */
  if (b.start_date) {
    const parsed = readDate(String(b.start_date));
    if (!parsed) {
      return NextResponse.json({
        error: `The start date "${String(b.start_date).slice(0, 40)}" could not be read. Use a date such as 15/09/2026 or 2026-09-15. Nothing was sent to ${name}.`
      }, { status: 400 });
    }
    b.start_date = parsed;
  }

  const start = b.start_date
    ? new Date(`${b.start_date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "";

  /**
   * Which location this offer is for.
   *
   * An id picks a place already in the list. A name is a suggestion from the
   * job, or a place added on purpose in the form; it is matched against the
   * list case insensitively and only added on a real send, so a preview never
   * writes anything. Neither is required: an offer with no location is sent
   * untagged, exactly as before.
   */
  let location: { id: string | null; name: string } | null = null;
  if (b.location_id) {
    const { data: loc, error: locErr } = await admin.from("offer_locations")
      .select("id, name").eq("id", String(b.location_id)).maybeSingle();
    if (locErr) return NextResponse.json({ error: missingTable(locErr.message) }, { status: 400 });
    if (!loc)
      return NextResponse.json({
        error: `That location is not in the list any more. Pick it again. Nothing was sent to ${name}.`
      }, { status: 400 });
    location = { id: loc.id, name: loc.name };
  } else if (tidyLocationName(b.location_name ?? "")) {
    const wanted = tidyLocationName(b.location_name);
    const { data: list, error: locErr } = await admin.from("offer_locations").select("id, name");
    if (locErr) return NextResponse.json({ error: missingTable(locErr.message) }, { status: 400 });
    const match = (list ?? []).find((l: any) => locationKey(l.name) === locationKey(wanted));
    location = match ? { id: match.id, name: match.name } : { id: null, name: wanted };
  }

  /**
   * The letter and the tag must say the same place, so the letter takes it
   * from the tag through {location} and never from typing. A letter that
   * asks for a location with none chosen would arrive with the bare token in
   * it, so that is refused on send and flagged on preview.
   */
  const rawBody = String(b.body ?? DEFAULT_OFFER_BODY);
  const asksForLocation = /\{location\}/.test(rawBody);
  if (asksForLocation && !location && !b.preview)
    return NextResponse.json({
      error: `The letter mentions {location} but no location is chosen. Pick one, or take {location} out of the letter. Nothing was sent to ${name}.`
    }, { status: 400 });

  const body = renderOfferBody(rawBody, {
    location: location?.name ?? "",
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
        ...(!b.start_date ? ["No start date stated."] : []),
        ...(asksForLocation && !location
          ? ["The letter mentions {location} but no location is chosen, so it shows the bare token. Sending will be refused until one is picked."] : []),
        ...(location && !asksForLocation
          ? [`Tagged to ${location.name}, but the letter does not say where. Add {location} to the letter if the candidate should see it.`] : []),
        ...(location && !location.id
          ? [`${location.name} is not in the location list yet. It will be added when this offer is sent.`] : [])
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
  /**
   * Never send the same offer twice by accident.
   *
   * The bulk screen skips people it has already sent to, but only within
   * that screen. Uploading the list again, to correct a mistake or after a
   * browser refresh, would otherwise send everyone a second letter with a
   * second acceptance link. An open or accepted offer for the same person
   * and role in the last sixty days blocks a new one unless resend is asked
   * for explicitly.
   */
  if (!b.resend) {
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const position = String(b.position ?? job?.title ?? "");
    const { data: prior } = await admin.from("offer_letters")
      .select("id, sent_at, status, position_title")
      .ilike("candidate_email", email)
      .in("status", ["sent", "accepted"])
      .gte("sent_at", since)
      .order("sent_at", { ascending: false });
    const same = (prior ?? []).find((o: any) =>
      String(o.position_title ?? "").trim().toLowerCase() === position.trim().toLowerCase());
    if (same) {
      const sentOn = new Date(same.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
      return NextResponse.json({
        duplicate: true, offer_id: same.id, sent_on: sentOn, status: same.status,
        error: `${name} already has this offer, sent ${sentOn}${same.status === "accepted" ? " and accepted" : ""}. Nothing was sent. To replace it, tick the correction box and send again.`
      }, { status: 409 });
    }
  }

  const allowance = await getAllowance(admin);
  if (allowance.remaining <= 0)
    return NextResponse.json({
      error: `Today's email allowance is used up, ${allowance.sent_today} of ${allowance.cap} sent. Nothing was created for ${name}. It resets at midnight, and anyone already sent is skipped if you run this again.`,
      allowance
    }, { status: 429 });

  // A place picked from the job's suggestions joins the list now, before the
  // offer is written, so the offer points at a row and the next one picks
  // the same spelling.
  if (location && !location.id) {
    const added = await findOrAddLocation(admin, location.name, gate.userId);
    if (!added.ok)
      return NextResponse.json({ error: `${added.error} Nothing was sent to ${name}.` }, { status: 400 });
    location = { id: added.location.id, name: added.location.name };
  }

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

  const offerRow: Record<string, any> = {
    application_id: app?.id ?? null, job_id: jobId, letterhead_id: lh?.id ?? null,
    candidate_name: name, candidate_email: email, body,
    position_title: String(b.position ?? job?.title ?? ""),
    salary: String(b.salary ?? ""), start_date: b.start_date || null,
    reporting_to: String(b.reporting_to ?? ""),
    pdf_path: stored?.location?.path ?? null,
    pdf_bucket: stored?.location?.bucket ?? null,
    pdf_provider: stored?.location?.provider ?? "r2",
    cc_emails: cc, sign_token: token, status: "sent",
    sent_at: new Date().toISOString(), sent_by: gate.userId,
    /**
     * The signing link stops working after this.
     *
     * It used to have no deadline at all, so a letter forwarded to a colleague
     * or left in an old mailbox could be accepted months later. The sender can
     * set their own window; two weeks is the default because that is how long
     * these are left open in practice.
     */
    expires_at: new Date(
      Date.now() + (Math.min(Math.max(Number(b.expires_in_days) || 14, 1), 90)) * 86_400_000
    ).toISOString()
  };
  /**
   * Only set when a location was chosen, so a database without 0065 still
   * sends untagged offers. When one WAS chosen and the column is missing,
   * the insert fails before any email goes, and the error names the
   * migration: an offer that silently lost its tag would undercount the very
   * location it was meant for.
   */
  if (location?.id) offerRow.location_id = location.id;

  let { data: row, error } = await admin.from("offer_letters")
    .insert(offerRow).select("id").single();

  /**
   * Deploying the code before running migration 0060 must not stop offers
   * going out. If the expiry column is not there yet, send the letter without
   * one and say so, rather than failing in front of a candidate.
   */
  let expiryWarning: string | null = null;
  if (error && /expires_at/.test(error.message)) {
    delete offerRow.expires_at;
    expiryWarning = "The offer was sent, but its signing link has no expiry because migration 0060 has not been run yet.";
    ({ data: row, error } = await admin.from("offer_letters")
      .insert(offerRow).select("id").single());
  }

  if (error) {
    if (/location_id/.test(error.message))
      return NextResponse.json({
        error: `${missingTable(error.message)} Nothing was sent to ${name}.`
      }, { status: 400 });
    const missing = /relation .* does not exist|could not find the table/i.test(error.message);
    return NextResponse.json({
      error: missing
        ? "The offer_letters table doesn't exist yet. Run migration 0055_offer_letters.sql."
        : error.message
    }, { status: missing ? 400 : 500 });
  }

  // Everything below writes against row.id, so an insert that reported no
  // error but produced no row stops here rather than failing later with a
  // message that says nothing useful.
  if (!row)
    return NextResponse.json({
      error: "The offer letter could not be saved, so nothing was sent. Try again."
    }, { status: 500 });

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
    warnings: expiryWarning ? [...grabWarnings, expiryWarning] : grabWarnings,
    message: res?.error
      ? `The offer was saved but the email failed: ${res.error}. Download the PDF and send it by hand.`
      : `Offer letter sent to ${email}${cc.length ? `, copied to ${cc.join(", ")}` : ""}.` +
        (grabWarnings.length ? ` Note: ${grabWarnings.join("; ")}.` : "") +
        (!stored ? " The stored copy could not be saved, but the letter was delivered." : "")
  });
}
