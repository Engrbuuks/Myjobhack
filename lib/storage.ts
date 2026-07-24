import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unified file storage: Cloudflare R2 primary, Supabase as fallback.
 *
 * WHY BOTH: files already uploaded live in Supabase. Flipping everything to R2
 * at once would break access to every existing CV. Instead, new uploads go to
 * R2 and reads check where the file actually is — so migration is gradual and
 * nothing breaks in between.
 *
 * IMPORTANT: R2 has no equivalent of Supabase's row-level security. Every read
 * here returns a short-lived signed URL, and the CALLER must do the permission
 * check first. Never hand an R2 URL to a client without checking who they are.
 */

const R2_BUCKET = process.env.R2_BUCKET || "myjobhack";
const SIGNED_URL_TTL = 3600; // 1 hour

export function r2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

let client: S3Client | null = null;
function r2(): S3Client {
  if (!r2Configured()) throw new Error("R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
      }
    });
  }
  return client;
}

/** Where a stored file actually lives. */
export type StorageLocation = { provider: "r2" | "supabase"; bucket: string; path: string };

/**
 * Upload a file. Goes to R2 when configured, otherwise falls back to Supabase
 * so the app keeps working if R2 credentials are missing.
 */
export async function uploadFile(opts: {
  supabase: SupabaseClient;
  path: string;                 // e.g. "resumes/<user-id>/cv.pdf"
  body: Buffer | Uint8Array;
  contentType?: string;
  fallbackBucket?: string;      // Supabase bucket if R2 is unavailable
}): Promise<{ location: StorageLocation | null; error: string | null }> {
  const { supabase, path, body, contentType, fallbackBucket = "documents" } = opts;

  if (r2Configured()) {
    try {
      await r2().send(new PutObjectCommand({
        Bucket: R2_BUCKET, Key: path, Body: body,
        ContentType: contentType || "application/octet-stream"
      }));
      return { location: { provider: "r2", bucket: R2_BUCKET, path }, error: null };
    } catch (e: any) {
      // Fall through to Supabase rather than losing the upload entirely.
      console.error("R2 upload failed, falling back to Supabase:", e?.message);
    }
  }

  const { error } = await supabase.storage.from(fallbackBucket)
    .upload(path, body, { contentType, upsert: true });
  if (error) return { location: null, error: error.message };
  return { location: { provider: "supabase", bucket: fallbackBucket, path }, error: null };
}

/**
 * A time-limited URL for a stored file.
 * The caller is responsible for authorising the request BEFORE calling this.
 */
export async function signedUrlFor(opts: {
  supabase: SupabaseClient;
  location: StorageLocation;
  expiresIn?: number;
}): Promise<{ url: string | null; error: string | null }> {
  const { supabase, location, expiresIn = SIGNED_URL_TTL } = opts;

  if (location.provider === "r2") {
    try {
      const url = await getSignedUrl(r2(),
        new GetObjectCommand({ Bucket: location.bucket, Key: location.path }),
        { expiresIn });
      return { url, error: null };
    } catch (e: any) {
      return { url: null, error: e?.message ?? "Could not sign R2 URL" };
    }
  }

  const { data, error } = await supabase.storage.from(location.bucket)
    .createSignedUrl(location.path, expiresIn);
  return { url: data?.signedUrl ?? null, error: error?.message ?? null };
}

/** Download raw bytes — used by CV parsing and résumé redaction. */
export async function downloadFile(opts: {
  supabase: SupabaseClient; location: StorageLocation;
}): Promise<{ buffer: Buffer | null; error: string | null }> {
  const { supabase, location } = opts;

  if (location.provider === "r2") {
    try {
      const res = await r2().send(new GetObjectCommand({ Bucket: location.bucket, Key: location.path }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? { buffer: Buffer.from(bytes), error: null } : { buffer: null, error: "Empty object" };
    } catch (e: any) {
      return { buffer: null, error: e?.message ?? "R2 download failed" };
    }
  }

  const { data, error } = await supabase.storage.from(location.bucket).download(location.path);
  if (error || !data) return { buffer: null, error: error?.message ?? "Download failed" };
  return { buffer: Buffer.from(await data.arrayBuffer()), error: null };
}

export async function deleteFile(opts: {
  supabase: SupabaseClient; location: StorageLocation;
}): Promise<{ error: string | null }> {
  const { supabase, location } = opts;
  if (location.provider === "r2") {
    try {
      await r2().send(new DeleteObjectCommand({ Bucket: location.bucket, Key: location.path }));
      return { error: null };
    } catch (e: any) { return { error: e?.message ?? "R2 delete failed" }; }
  }
  const { error } = await supabase.storage.from(location.bucket).remove([location.path]);
  return { error: error?.message ?? null };
}

/**
 * Resolve where a document record actually lives.
 * Existing rows have no provider column, so anything unmarked is Supabase.
 */
export function locationFromDocument(doc: { bucket?: string | null; path: string; storage_provider?: string | null }): StorageLocation {
  return {
    provider: doc.storage_provider === "r2" ? "r2" : "supabase",
    bucket: doc.storage_provider === "r2" ? R2_BUCKET : (doc.bucket || "documents"),
    path: doc.path
  };
}

/* ============================================================
   Upload limits, quotas and logging.
   These predate R2 and are unchanged — they govern what a user may
   upload regardless of where the bytes end up.
   ============================================================ */

export const MAX_FILE_BYTES = 8 * 1024 * 1024;      // 8 MB per file

export const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png", "image/jpeg", "image/webp"
];

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Storage allowance by role. */
export async function quotaFor(role: string | null | undefined): Promise<number> {
  switch (role) {
    case "admin":
    case "recruiter":     return 2 * 1024 * 1024 * 1024;   // 2 GB
    case "employer":      return 500 * 1024 * 1024;        // 500 MB
    case "elite_member":  return 100 * 1024 * 1024;        // 100 MB
    default:              return 50 * 1024 * 1024;         // 50 MB
  }
}

/** How much a profile has used, from the upload log. */
export async function usedBytes(profileId: string): Promise<number> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data } = await admin.from("upload_log").select("bytes").eq("profile_id", profileId);
  return (data ?? []).reduce((t: number, r: any) => t + Number(r.bytes || 0), 0);
}

/** Record an upload so quotas and storage spend stay visible. */
export async function logUpload(opts: {
  bucket: string; path: string; profileId: string | null; kind: string; bytes: number;
  provider?: "r2" | "supabase";
}): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.from("upload_log").insert({
      bucket: opts.bucket, path: opts.path, profile_id: opts.profileId,
      kind: opts.kind, bytes: opts.bytes,
      storage_provider: opts.provider ?? (r2Configured() ? "r2" : "supabase")
    });
  } catch { /* logging must never block an upload */ }
}

/**
 * Signed URL for a document by ID, resolving whichever provider holds it.
 *
 * Prefer this over calling supabase.storage.createSignedUrl directly: a file
 * moved to R2 would return a broken link from the Supabase call, and the
 * failure is silent — the link simply 404s when someone clicks it.
 *
 * The CALLER must authorise the request first. This does no permission checks.
 */
export async function signedUrlForDocument(
  supabase: SupabaseClient, documentId: string, expiresIn = SIGNED_URL_TTL
): Promise<string | null> {
  const { data: doc } = await supabase
    .from("documents").select("bucket, path, storage_provider").eq("id", documentId).maybeSingle();
  if (!doc) return null;

  const { url } = await signedUrlFor({
    supabase, location: locationFromDocument(doc as any), expiresIn
  });
  return url;
}
