import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { compressUpload } from "@/lib/compress";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024; // 10MB in
const ALLOWED_KINDS = ["resume", "credential", "avatar", "jd", "payment_proof", "other"];
const RESUME_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const kind = String(form.get("kind") ?? "other");

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!ALLOWED_KINDS.includes(kind))
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  if (kind === "resume" && !RESUME_MIMES.includes(file.type))
    return NextResponse.json({ error: "Resume must be PDF or DOCX" }, { status: 400 });

  const input = Buffer.from(await file.arrayBuffer());
  /**
   * The declared type can lie — a photo renamed to .pdf passes the check above.
   * Verify the actual bytes of EVERY kind, not just résumés.
   *
   * WHAT THIS CLOSES: only "resume" was ever sniffed. A credential, a job
   * description, a payment proof or an "other" upload was stored under
   * whatever content type the browser declared, so an HTML or SVG file was
   * served back inline and the admin verifications page handed staff a link
   * that rendered it inside their own signed in session.
   */
  const { checkUploadFile, safeStoredMime } = await import("@/lib/storage");
  const check = checkUploadFile({ buf: input, kind, declaredMime: file.type, filename: file.name });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  /**
   * Compress against the SNIFFED type, not the declared one. A real PNG sent
   * with a declared type of application/pdf used to fail the PDF branch, fall
   * through untouched, and then be stored as a PDF. Compression and the stored
   * content type should both follow what the file actually is.
   */
  const c = await compressUpload(input, check.sniffed ?? file.type, file.name);

  /**
   * Store anything that is not an image or a PDF as application/octet-stream.
   *
   * The stored content type is what R2 and Supabase serve back, so this is
   * what decides whether a signed link renders in the viewer's browser or
   * downloads. A Word document has nothing to gain from rendering and plenty
   * to lose.
   */
  const storedMime = safeStoredMime(c.mime);

  const bucket = kind === "avatar" ? "avatars" : "documents";
  const path = `${user.id}/${kind}-${Date.now()}.${c.ext}`;

  // Goes to R2 when configured, Supabase otherwise. This is the main upload
  // path — every CV and document flows through here, so it is the one that
  // actually keeps Supabase storage from growing.
  const { uploadFile, logUpload } = await import("@/lib/storage");
  const up = await uploadFile({
    supabase, path, body: c.buffer, contentType: storedMime, fallbackBucket: bucket
  });
  if (up.error || !up.location)
    return NextResponse.json({ error: up.error ?? "Upload failed" }, { status: 500 });

  await logUpload({
    bucket: up.location.bucket, path: up.location.path, profileId: user.id,
    kind, bytes: c.size, provider: up.location.provider
  });

  const { data: doc, error: dbErr } = await supabase
    .from("documents")
    .insert({
      owner_id: user.id,
      kind,
      bucket: up.location.bucket,
      path: up.location.path,
      storage_provider: up.location.provider,
      original_name: file.name,
      // Record what the file is actually served as, so the row and the object
      // never disagree. The real format stays recoverable from the path
      // extension, which is what lib/extract.ts reads.
      mime: storedMime,
      size_bytes: c.size,
      original_size_bytes: c.originalSize
    })
    .select("id, path, size_bytes, original_size_bytes")
    .single();
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({
    document: doc,
    saved_pct: c.originalSize > 0 ? Math.round((1 - c.size / c.originalSize) * 100) : 0
  });
}
