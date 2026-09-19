import { buildOfferPdf } from "@/lib/offerLetter";
import { downloadFile } from "@/lib/storage";

/**
 * Rebuild an offer letter from its stored record.
 *
 * One function, used wherever a letter is produced after it was first sent:
 * the countersigned copy on acceptance, and the viewer when a stored file is
 * missing. Using the same code in both places is what keeps the signed copy
 * identical to the letter the candidate actually received, apart from the
 * signature itself.
 */

async function fetchBytes(admin: any, path?: string | null, bucket?: string | null, provider?: string | null) {
  if (!path) return null;
  try {
    const r: any = await Promise.race([
      downloadFile({
        supabase: admin,
        location: {
          provider: provider === "supabase" ? "supabase" : "r2",
          bucket: bucket || process.env.R2_BUCKET || "myjobhack",
          path
        } as any
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 10_000))
    ]);
    return r?.buffer ? new Uint8Array(r.buffer) : null;
  } catch {
    return null;
  }
}

export async function renderOfferFromRow(
  admin: any, offer: any, opts: { signed: boolean; signedName?: string; signedAt?: string }
): Promise<Uint8Array> {
  const { data: lh } = offer.letterhead_id
    ? await admin.from("letterheads").select("*").eq("id", offer.letterhead_id).maybeSingle()
    : { data: null };

  const [paper, signature] = await Promise.all([
    fetchBytes(admin, lh?.file_path, lh?.file_bucket, lh?.file_provider),
    fetchBytes(admin, lh?.signature_path, lh?.signature_bucket, lh?.signature_provider)
  ]);

  return buildOfferPdf({
    bytes: paper,
    kind: lh?.file_kind === "image" ? "image" : "pdf",
    topMargin: lh?.top_margin_pt ?? 150,
    bottomMargin: lh?.bottom_margin_pt ?? 110,
    signature,
    signatoryName: lh?.signatory_name ?? "",
    signatoryTitle: lh?.signatory_title ?? ""
  }, {
    candidateName: offer.candidate_name,
    body: offer.body,
    // Stored at send time, so the rebuilt letter carries the same date and
    // reference as the one in the candidate's inbox. Older rows without
    // them fall back to the send date rather than today's date.
    dateLine: offer.date_line ?? (offer.sent_at
      ? new Date(offer.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : undefined),
    reference: offer.reference ?? undefined,
    startOffset: Number(offer.start_offset) || 0,
    countersign: true,
    signedName: opts.signed ? (opts.signedName ?? offer.signed_name) : null,
    signedAt: opts.signed ? (opts.signedAt ?? offer.signed_at) : null
  });
}

/** Fetch a stored copy, or null when there is none or it cannot be read. */
export async function storedCopy(admin: any, which: "sent" | "signed", offer: any) {
  return which === "signed"
    ? fetchBytes(admin, offer.signed_pdf_path, offer.signed_pdf_bucket ?? offer.pdf_bucket, offer.signed_pdf_provider ?? offer.pdf_provider)
    : fetchBytes(admin, offer.pdf_path, offer.pdf_bucket, offer.pdf_provider);
}
