import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOfferPdf } from "@/lib/offerLetter";
import { downloadFile, uploadFile } from "@/lib/storage";

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
    await admin.from("offer_letters").update({
      status: "declined", declined_at: new Date().toISOString(),
      decline_reason: String(reason ?? "").slice(0, 500) || null
    }).eq("id", offer.id);
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

  return NextResponse.json({ ok: true, status: "accepted" });
}
