import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { renderOfferFromRow, storedCopy } from "@/lib/offerRender";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Open an offer letter from the portal.
 *
 * GET ?id=<offer>&copy=signed|sent[&download=1]
 *
 * signed  the countersigned copy, the same file the candidate and everyone
 *         told about the offer received on acceptance
 * sent    the letter as it went out, before anyone signed
 *
 * The stored file is served when there is one. When there is not, because
 * storage failed at the time or the offer predates stored copies, the letter
 * is rebuilt from the record with the same renderer that produced it. The
 * record holds the body, the signatory, the typed name and the time, so the
 * rebuild is faithful rather than an approximation.
 *
 * Gated on applicants.contact, the same capability needed to issue an offer:
 * these letters state salaries, so seeing one is no lesser a right than
 * sending one.
 */
export async function GET(request: Request) {
  const gate = await requirePermission("applicants.contact");
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const copy = url.searchParams.get("copy") === "sent" ? "sent" : "signed";
  const download = url.searchParams.get("download") === "1";
  if (!id) return NextResponse.json({ error: "Which offer? The id is missing." }, { status: 400 });

  const admin = createAdminClient();
  const { data: offer, error } = await admin.from("offer_letters").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!offer) return NextResponse.json({ error: "That offer no longer exists." }, { status: 404 });

  if (copy === "signed" && !offer.signed_at) {
    return NextResponse.json({
      error: offer.declined_at
        ? `${offer.candidate_name} declined this offer, so there is no signed copy. Open the letter as sent instead.`
        : `${offer.candidate_name} has not signed yet. Open the letter as sent instead.`
    }, { status: 404 });
  }

  let bytes: Uint8Array | null = null;
  try {
    bytes = await storedCopy(admin, copy, offer);
    // Before migration 0057 a signed copy was written over pdf_path.
    if (!bytes && copy === "signed" && String(offer.pdf_path ?? "").endsWith("-accepted.pdf")) {
      bytes = await storedCopy(admin, "sent", offer);
    }
    if (!bytes) bytes = await renderOfferFromRow(admin, offer, { signed: copy === "signed" });
  } catch (e: any) {
    return NextResponse.json({ error: `The letter could not be produced: ${e?.message ?? "unknown error"}` }, { status: 500 });
  }

  const safeName = String(offer.candidate_name ?? "candidate").replace(/[^\w .]/g, "").trim() || "candidate";
  const filename = copy === "signed"
    ? `Offer letter, signed, ${safeName}.pdf`
    : `Offer letter, ${safeName}.pdf`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // Salary information: never cached by a shared proxy.
      "Cache-Control": "private, no-store"
    }
  });
}
