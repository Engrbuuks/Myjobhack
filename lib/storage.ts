import { createAdminClient } from "@/lib/supabase/admin";

export type UploadKind = "resume" | "avatar" | "course_asset" | "guest_resume" | "training_thumb" | "other";

const DEFAULT_QUOTA: Record<string, number> = {
  job_seeker: 26_214_400,      // 25 MB
  elite_member: 104_857_600,   // 100 MB
  employer: 524_288_000,       // 500 MB
  recruiter: 524_288_000,
  trainer: 1_073_741_824,      // 1 GB
  partner: 104_857_600,
  admin: 10_737_418_240
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

/** Quota for a role, honouring any override saved in app_settings. */
export async function quotaFor(role: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "storage_quota").maybeSingle();
  const map = { ...DEFAULT_QUOTA, ...((data?.value as Record<string, number>) ?? {}) };
  return map[role] ?? DEFAULT_QUOTA.job_seeker;
}

/** Bytes already used by a profile. */
export async function usedBytes(profileId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin.from("storage_objects_log").select("bytes").eq("profile_id", profileId);
  return (data ?? []).reduce((sum, r) => sum + Number(r.bytes || 0), 0);
}

/** Check a pending upload against file-size, type, and remaining quota. */
export async function checkUpload(opts: {
  profileId: string; role: string; bytes: number; mime?: string; allowTypes?: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (opts.bytes > MAX_FILE_BYTES)
    return { ok: false, error: `File is too large. Maximum ${humanBytes(MAX_FILE_BYTES)} per file.` };

  const allowed = opts.allowTypes ?? ALLOWED_DOC_TYPES;
  if (opts.mime && allowed.length && !allowed.includes(opts.mime))
    return { ok: false, error: "That file type isn't accepted. Use PDF or Word." };

  const [quota, used] = await Promise.all([quotaFor(opts.role), usedBytes(opts.profileId)]);
  if (used + opts.bytes > quota)
    return { ok: false, error: `This would exceed your ${humanBytes(quota)} storage allowance. Delete an old file and try again.` };

  return { ok: true };
}

/** Record an upload in the ledger so quotas stay accurate. */
export async function logUpload(opts: {
  bucket: string; path: string; profileId: string | null; kind: UploadKind; bytes: number;
}) {
  const admin = createAdminClient();
  await admin.from("storage_objects_log").insert({
    bucket: opts.bucket, path: opts.path, profile_id: opts.profileId,
    kind: opts.kind, bytes: opts.bytes
  });
}

/** Remove a file from its bucket and the ledger together. */
export async function deleteObject(bucket: string, path: string) {
  const admin = createAdminClient();
  await admin.storage.from(bucket).remove([path]);
  await admin.from("storage_objects_log").delete().eq("bucket", bucket).eq("path", path);
}
