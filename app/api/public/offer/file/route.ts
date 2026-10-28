import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderOfferFromRow, storedCopy } from "@/lib/offerRender";
import { rateLimit, clientIp, LIMITS, tooMany } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * A candidate downloading their own countersigned offer letter.
 *
 * GET ?token=<the signing link's token>
 *
 * This replaces emailing the signed PDF on acceptance, which cost up to seven
 * messages per acceptance off the daily allowance. The candidate is prompted
 * to download it on the page where they accepted, and can come back to the
 * same link later.
 *
 * The token is the credential, exactly as it is for accepting: it was sent
 * only to the candidate, and it opens this one offer. It serves the SIGNED
 * copy only, and only once the offer is accepted and not withdrawn, so an
 * unanswered link reveals nothing it did not already show on the page.
 */
export async function GET(request: Request) {
  const limit = await rateLimit(clientIp(request), LIMITS.offer_file_ip);
  if (!limit.ok)
    return tooMany("Too many downloads from this connection. Try again in an hour.", limit.retryAfterSeconds);

  const token = new URL(request.url).searchParams.get("token") ?? "";
  // Tokens are long random strings. Anything else is not worth a query.
  if (token.length < 16 || token.length > 200)
    return NextResponse.json({ error: "This link is not valid." }, { status: 404 });

  const admin = createAdminClient();
  const { data: offer } = await admin.from("offer_letters")
    .select("*").eq("sign_token", token).maybeSingle();

  if (!offer || offer.withdrawn_at)
    return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  if (!offer.signed_at)
    return NextResponse.json({ error: "There is no signed letter yet. Accept the offer first." }, { status: 404 });

  let bytes: Uint8Array | null = null;
  try {
    bytes = await storedCopy(admin, "signed", offer);
    // Before migration 0057 the signed copy was written over pdf_path.
    if (!bytes && String(offer.pdf_path ?? "").endsWith("-accepted.pdf"))
      bytes = await storedCopy(admin, "sent", offer);
    // Storage failed at the time: rebuild from the record, as the portal does.
    if (!bytes) bytes = await renderOfferFromRow(admin, offer, { signed: true });
  } catch {
    return NextResponse.json({
      error: "Your letter could not be prepared just now. Try again in a minute."
    }, { status: 500 });
  }

  const safeName = String(offer.candidate_name ?? "").replace(/[^\w .]/g, "").trim() || "candidate";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Offer letter, signed, ${safeName}.pdf"`,
      // It states a salary: never cached by a shared proxy, and the link is
      // not passed on to whatever the PDF viewer opens next.
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}
