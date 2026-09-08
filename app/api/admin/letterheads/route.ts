import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { uploadFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Letterheads: the company paper an offer is printed on.
 *
 * GET    list them
 * POST   create or replace one, with its artwork and signature image
 * PATCH  edit the margins, signatory or default flag
 * DELETE remove one
 */

function tableMissing(err: any): string | null {
  const m = String(err?.message ?? "");
  if (err?.code === "42P01" || /relation .* does not exist|could not find the table/i.test(m))
    return "The letterheads table doesn't exist yet. Run migration 0055_offer_letters.sql in the Supabase SQL editor.";
  return null;
}

export async function GET() {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  const { data, error } = await admin.from("letterheads")
    .select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false });
  if (error) {
    const m = tableMissing(error);
    return NextResponse.json({ error: m ?? error.message }, { status: m ? 400 : 500 });
  }
  return NextResponse.json({ letterheads: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();

  const fd = await request.formData();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ error: "Give the letterhead a name, so you can tell them apart." }, { status: 400 });

  const paper = fd.get("paper") as File | null;
  const signature = fd.get("signature") as File | null;

  /**
   * The artwork is required on create. A letterhead with no paper is just a
   * signature block, and issuing an offer on it would look like the platform
   * wrote to the candidate rather than the company.
   */
  if (!paper || !paper.size)
    return NextResponse.json({ error: "Upload the letterhead as a PDF or PNG." }, { status: 400 });
  if (paper.size > 8 * 1024 * 1024)
    return NextResponse.json({ error: "That file is over 8MB. Export it at a lower resolution." }, { status: 400 });

  const isPdf = paper.type === "application/pdf" || paper.name.toLowerCase().endsWith(".pdf");
  const stamp = Date.now();

  const up = await uploadFile({
    supabase: admin as any,
    path: `letterheads/${stamp}-${paper.name.replace(/[^\w.-]/g, "_")}`,
    body: Buffer.from(await paper.arrayBuffer()),
    contentType: paper.type || (isPdf ? "application/pdf" : "image/png")
  });
  if (!up.location)
    return NextResponse.json({ error: `Could not store the letterhead: ${up.error}` }, { status: 500 });

  let sig: any = null;
  if (signature && signature.size) {
    if (signature.size > 2 * 1024 * 1024)
      return NextResponse.json({ error: "The signature image is over 2MB. A small PNG is plenty." }, { status: 400 });
    const s = await uploadFile({
      supabase: admin as any,
      path: `letterheads/${stamp}-sig-${signature.name.replace(/[^\w.-]/g, "_")}`,
      body: Buffer.from(await signature.arrayBuffer()),
      contentType: signature.type || "image/png"
    });
    sig = s.location;
  }

  const makeDefault = String(fd.get("is_default") ?? "") === "true";
  if (makeDefault) await admin.from("letterheads").update({ is_default: false }).eq("is_default", true);

  const { data, error } = await admin.from("letterheads").insert({
    name,
    file_path: up.location.path, file_bucket: up.location.bucket, file_provider: up.location.provider,
    file_kind: isPdf ? "pdf" : "image",
    top_margin_pt: Number(fd.get("top_margin_pt")) || 150,
    bottom_margin_pt: Number(fd.get("bottom_margin_pt")) || 110,
    signature_path: sig?.path ?? null, signature_bucket: sig?.bucket ?? null,
    signature_provider: sig?.provider ?? null,
    signatory_name: String(fd.get("signatory_name") ?? ""),
    signatory_title: String(fd.get("signatory_title") ?? ""),
    is_default: makeDefault,
    created_by: gate.userId
  }).select("id").single();

  if (error) {
    const m = tableMissing(error);
    return NextResponse.json({ error: m ?? error.message }, { status: m ? 400 : 500 });
  }
  return NextResponse.json({ ok: true, id: data.id, message: `Letterhead "${name}" saved.` });
}

export async function PATCH(request: Request) {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();
  const b = await request.json().catch(() => ({} as any));
  if (!b.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: any = {};
  for (const k of ["signatory_name", "signatory_title", "name"])
    if (typeof b[k] === "string") patch[k] = b[k].slice(0, 200);
  for (const k of ["top_margin_pt", "bottom_margin_pt"])
    if (b[k] != null) patch[k] = Math.max(0, Math.min(400, Number(b[k])));
  if (b.is_default === true) {
    await admin.from("letterheads").update({ is_default: false }).eq("is_default", true);
    patch.is_default = true;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await admin.from("letterheads").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return gate.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  // Offers already issued keep working: letterhead_id is set null, and the
  // stored PDF is untouched. Deleting paper must not unmake a signed offer.
  const { count } = await admin.from("offer_letters")
    .select("id", { count: "exact", head: true }).eq("letterhead_id", id);
  const { error } = await admin.from("letterheads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    message: count ? `Removed. ${count} offer(s) already issued on it keep their stored copies.` : "Removed."
  });
}
