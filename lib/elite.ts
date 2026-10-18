/**
 * Elite membership: the settings, the standing, and the two rules that used
 * to be copy rather than code.
 *
 * THE PROBLEM THIS FIXES. The membership page sold six perks. "Elite members
 * surface first when employers search the pool" and "curated roles reach
 * Elite members before the public board" were both untrue: no query ordered
 * by membership and no column held a role back. A member who tested either
 * claim found nothing, which is worse than not making the claim.
 *
 * Everything here is read or compute. Nothing in this file spends money,
 * because a cash perk was not agreed.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type ToolkitAllowance = { monthly: number; daily: number };

export type EliteSettings = {
  /** Working days an employer has to answer a verified Elite applicant. */
  sla_days: number;
  /** Default length of an early access window, offered in the job form. */
  early_access_hours: number;
  /** No salary figure is published for a group smaller than this. */
  benchmark_min_group: number;
  toolkit_credits: { subscriber: ToolkitAllowance; elite: ToolkitAllowance };
  /** Credits each tool costs, keyed by the ai_runs tool name. */
  toolkit_weights: Record<string, number>;
};

/**
 * The same values migration 0064 seeds. Held here as well so a missing or
 * half edited settings row degrades to something sane rather than to zero,
 * which would read as "nobody may use anything".
 */
export const ELITE_DEFAULTS: EliteSettings = {
  sla_days: 5,
  early_access_hours: 72,
  benchmark_min_group: 5,
  toolkit_credits: {
    subscriber: { monthly: 30, daily: 8 },
    elite: { monthly: 60, daily: 12 }
  },
  toolkit_weights: { resume_review: 1, skills_gap: 2, interview_prep: 3 }
};

export async function eliteSettings(): Promise<EliteSettings> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("app_settings").select("value").eq("key", "elite").maybeSingle();
    const v = (data?.value ?? {}) as Partial<EliteSettings>;
    return {
      ...ELITE_DEFAULTS,
      ...v,
      toolkit_credits: {
        subscriber: { ...ELITE_DEFAULTS.toolkit_credits.subscriber, ...(v.toolkit_credits?.subscriber ?? {}) },
        elite: { ...ELITE_DEFAULTS.toolkit_credits.elite, ...(v.toolkit_credits?.elite ?? {}) }
      },
      toolkit_weights: { ...ELITE_DEFAULTS.toolkit_weights, ...(v.toolkit_weights ?? {}) }
    };
  } catch {
    return ELITE_DEFAULTS;
  }
}

/* ------------------------------------------------------------------ *
 * Standing
 * ------------------------------------------------------------------ */

export type EliteStanding = {
  verified: boolean;
  status: string;
  memberNo: number | null;
  memberRef: string | null;
  chapterId: string | null;
  classYear: number | null;
  distinction: string | null;
  slug: string | null;
  verifyCode: string | null;
  publicProfile: boolean;
  referralCredits: number;
};

/** Padded member number, the way it is shown everywhere. */
export function memberRef(no: number | null | undefined): string | null {
  return no == null ? null : `№ ${String(no).padStart(4, "0")}`;
}

/**
 * One read, with the service role, for everything the portal needs to know
 * about a membership. Returns null when the person has never applied.
 */
export async function eliteStanding(profileId: string, admin?: any): Promise<EliteStanding | null> {
  const db = admin ?? createAdminClient();
  const { data } = await db.from("elite_memberships")
    .select("status, member_no, chapter_id, class_year, distinction, public_slug, public_profile, referral_credits")
    .eq("talent_id", profileId).maybeSingle();
  if (!data) return null;

  /**
   * The verification code lives in elite_secrets, which has row level
   * security on and no policy, because elite_memberships is readable by every
   * verified peer and a code is a secret.
   */
  const { data: secret } = await db.from("elite_secrets")
    .select("verify_code").eq("talent_id", profileId).maybeSingle();
  return {
    verified: data.status === "verified",
    status: data.status,
    memberNo: data.member_no ?? null,
    memberRef: memberRef(data.member_no),
    chapterId: data.chapter_id ?? null,
    classYear: data.class_year ?? null,
    distinction: data.distinction ?? null,
    slug: data.public_slug ?? null,
    verifyCode: secret?.verify_code ?? null,
    publicProfile: !!data.public_profile,
    referralCredits: data.referral_credits ?? 0
  };
}

/** The cheap question, when the rest of the standing is not needed. */
export async function isEliteVerified(profileId: string | null | undefined, admin?: any): Promise<boolean> {
  if (!profileId) return false;
  const db = admin ?? createAdminClient();
  const { data } = await db.from("elite_memberships")
    .select("status").eq("talent_id", profileId).maybeSingle();
  return data?.status === "verified";
}

/* ------------------------------------------------------------------ *
 * Early access
 * ------------------------------------------------------------------ */

/**
 * Hide roles still inside their Elite window from everyone else.
 *
 * Applied to a PostgREST query builder. The policy in 0064 enforces the same
 * rule for a reader using their own token; this is for the pages that read
 * with the service role, where policies do not apply at all. Both are
 * needed: one of them alone is a hole.
 */
export function withEarlyAccess<T>(query: T, isElite: boolean, nowIso = new Date().toISOString()): T {
  if (isElite) return query;
  return (query as any).or(`elite_until.is.null,elite_until.lte.${nowIso}`) as T;
}

/** Is this role still held back, and for how much longer? */
export function earlyAccess(eliteUntil: string | null | undefined, now = new Date()): {
  held: boolean; hoursLeft: number; label: string;
} {
  if (!eliteUntil) return { held: false, hoursLeft: 0, label: "" };
  const until = new Date(eliteUntil).getTime();
  const ms = until - now.getTime();
  if (!Number.isFinite(until) || ms <= 0) return { held: false, hoursLeft: 0, label: "" };
  const hours = Math.ceil(ms / 3_600_000);
  const label = hours >= 48
    ? `Elite only for ${Math.floor(hours / 24)} more days`
    : hours > 1 ? `Elite only for ${hours} more hours`
    : "Elite only, opens within the hour";
  return { held: true, hoursLeft: hours, label };
}

/* ------------------------------------------------------------------ *
 * The answer guarantee
 * ------------------------------------------------------------------ */

/**
 * Add working days, weekends excluded.
 *
 * Nigerian public holidays are not excluded, and deliberately so: there is no
 * holiday table on the platform, and quietly approximating one would make the
 * deadline wrong in a way nobody could explain to an employer. Weekends are
 * unambiguous. Say five working days, mean five working days.
 */
export function addWorkingDays(from: Date, days: number): Date {
  const out = new Date(from.getTime());
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    const d = out.getUTCDay();
    if (d !== 0 && d !== 6) left -= 1;
  }
  return out;
}

export type SlaState = {
  /** No guarantee on this application. */
  none: boolean;
  answered: boolean;
  overdue: boolean;
  /** Negative once the deadline has passed. */
  hoursLeft: number;
  label: string;
};

export function slaState(
  dueAt: string | null | undefined,
  answeredAt: string | null | undefined,
  now = new Date()
): SlaState {
  if (!dueAt) return { none: true, answered: !!answeredAt, overdue: false, hoursLeft: 0, label: "" };
  if (answeredAt) {
    const late = new Date(answeredAt).getTime() > new Date(dueAt).getTime();
    return {
      none: false, answered: true, overdue: late, hoursLeft: 0,
      label: late ? "Answered late" : "Answered in time"
    };
  }
  const ms = new Date(dueAt).getTime() - now.getTime();
  const hours = Math.round(ms / 3_600_000);
  if (ms <= 0) {
    const daysOver = Math.max(1, Math.floor(-ms / 86_400_000));
    return {
      none: false, answered: false, overdue: true, hoursLeft: hours,
      label: daysOver === 1 ? "Answer overdue by a day" : `Answer overdue by ${daysOver} days`
    };
  }
  if (hours <= 24) return { none: false, answered: false, overdue: false, hoursLeft: hours, label: `Answer due within ${Math.max(1, hours)} hours` };
  return {
    none: false, answered: false, overdue: false, hoursLeft: hours,
    label: `Answer due in ${Math.floor(hours / 24)} days`
  };
}
