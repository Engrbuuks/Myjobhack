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
  const c = await compressUpload(input, file.type, file.name);

  const bucket = kind === "avatar" ? "avatars" : "documents";
  const path = `${user.id}/${kind}-${Date.now()}.${c.ext}`;

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, c.buffer, { contentType: c.mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: doc, error: dbErr } = await supabase
    .from("documents")
    .insert({
      owner_id: user.id,
      kind,
      bucket,
      path,
      original_name: file.name,
      mime: c.mime,
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
