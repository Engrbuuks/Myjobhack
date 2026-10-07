// Type-only: this module is imported by a client component, and a value
// import of the Supabase client would pull the SDK into the browser bundle.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Everything the interview desk needs about one interview, in one object.
 *
 * WHY THIS GREW: the desk used to carry a name, an email and a time. That is
 * enough to read a list and nothing else. Before an interview you want the
 * person's CV, their phone, which job and company this is for, and a way into
 * their application. Each of those sat one query away and none of them were
 * being fetched, so the page looked like a diary rather than an interviewing
 * tool.
 */
export type Competency = { name: string; rating: number; note?: string };

export type InterviewRow = {
  id: string;
  status: string;
  outcome: string;
  round: number;
  mode: string;
  scheduled_at: string | null;
  duration_min: number | null;
  location_or_link: string;
  calendly_url: string;
  scorecard: Competency[];
  feedback: string;

  /** The person. Guests have no profile, so these come off the application. */
  name: string;
  email: string;
  phone: string;
  isGuest: boolean;

  /** What they are being interviewed for. */
  jobId: string;
  jobTitle: string;
  company: string;

  /** Where to go for the full picture. */
  applicationId: string | null;
  applicationStatus: string;
  applicantHref: string | null;
  resumeUrl: string | null;
  fitScore: number | null;

  /** Render times in THIS zone, never the viewer's. */
  timezone: string;

  /** Set when the interview came from a bulk run. */
  batchId: string | null;

  cancelledAt: string | null;
  cancelReason: string;
  cancelNotified: boolean;
  createdAt: string | null;
};

/**
 * Build display rows for a set of interviews.
 *
 * Four queries total, whatever the number of interviews. The earlier version
 * ran two per row, so a day of forty interviews fired eighty round trips and
 * the page took seconds to paint.
 */
export async function assembleInterviewRows(
  client: SupabaseClient,
  interviews: any[],
  opts: { portal?: "admin" | "employer" } = {}
): Promise<InterviewRow[]> {
  if (!interviews.length) return [];
  const portal = opts.portal ?? "admin";

  const ids = <T,>(xs: T[]) => Array.from(new Set(xs.filter(Boolean)));
  const appIds = ids(interviews.map((iv) => iv.application_id));
  const jobIds = ids(interviews.map((iv) => iv.job_id));

  /**
   * Applications carry the guest's details, the résumé and the pipeline
   * status. They are the reason a guest row can show anything at all: most
   * applicants never register, so there is no profile to read.
   */
  const [appRes, jobRes] = await Promise.all([
    appIds.length
      ? client.from("applications")
          .select("id, job_id, talent_id, status, guest_name, guest_email, guest_phone, guest_resume_path, resume_document_id, ai_fit_score")
          .in("id", appIds)
      : Promise.resolve({ data: [] as any[] } as any),
    jobIds.length
      ? client.from("jobs").select("id, title, company_name").in("id", jobIds)
      : Promise.resolve({ data: [] as any[] } as any)
  ]);

  const apps: any[] = (appRes as any).data ?? [];
  const jobs: any[] = (jobRes as any).data ?? [];

  // Profiles for registered candidates, from the interview and the application
  // both, since one may have a talent_id the other lacks.
  const talentIds = ids([
    ...interviews.map((iv) => iv.talent_id),
    ...apps.map((a) => a.talent_id)
  ]);
  const profRes: any = talentIds.length
    ? await client.from("profiles").select("id, full_name, email, phone").in("id", talentIds)
    : { data: [] as any[] };

  const aById = new Map(apps.map((a: any) => [a.id, a]));
  const jById = new Map(jobs.map((j: any) => [j.id, j]));
  const pById = new Map<string, any>((profRes.data ?? []).map((p: any) => [p.id, p]));

  return interviews.map((iv) => {
    const app = iv.application_id ? aById.get(iv.application_id) : null;
    const talentId = iv.talent_id ?? app?.talent_id ?? null;
    const p = talentId ? pById.get(talentId) : null;
    const job = jById.get(iv.job_id);

    const hasResume = !!(app?.guest_resume_path || app?.resume_document_id);
    const jobId = iv.job_id ?? app?.job_id ?? "";

    return {
      id: iv.id,
      status: iv.status,
      outcome: iv.outcome ?? "pending",
      round: iv.round ?? 1,
      mode: iv.mode ?? "video",
      scheduled_at: iv.scheduled_at ?? null,
      duration_min: iv.duration_min ?? null,
      location_or_link: iv.location_or_link ?? "",
      calendly_url: iv.calendly_url ?? "",
      scorecard: iv.scorecard ?? [],
      feedback: iv.feedback ?? "",

      // Name and email: profile first, then whatever the interview row stored
      // at send time, then the application. The last two matter because bulk
      // runs copy the guest's details onto the interview itself.
      name: p?.full_name ?? iv.guest_name ?? app?.guest_name ?? "Unnamed candidate",
      email: p?.email ?? iv.guest_email ?? app?.guest_email ?? "",
      // Guest phone leads, the same order the applicant list uses, so the
      // number on this page matches the number in the export.
      phone: app?.guest_phone ?? p?.phone ?? "",
      isGuest: !talentId,

      jobId,
      jobTitle: job?.title ?? "Role",
      company: job?.company_name ?? "",

      applicationId: iv.application_id ?? null,
      applicationStatus: app?.status ?? "",
      applicantHref: jobId
        ? `/portal/${portal}/jobs/${jobId}/applicants`
        : null,
      // Served through the same gated endpoint the applicant lists use, so
      // redaction and unlock rules stay in one place.
      resumeUrl: hasResume && iv.application_id
        ? `/api/employer/resume?application_id=${iv.application_id}`
        : null,
      fitScore: app?.ai_fit_score ?? null,

      timezone: iv.timezone || "Africa/Lagos",
      batchId: iv.batch_id ?? null,

      cancelledAt: iv.cancelled_at ?? null,
      cancelReason: iv.cancel_reason ?? "",
      cancelNotified: !!iv.cancel_notified,
      createdAt: iv.created_at ?? null
    };
  });
}

/** Interviews still ahead of you, and everything else. */
export function splitUpcoming(rows: InterviewRow[]) {
  const active = rows.filter((r) => ["invited", "scheduled"].includes(r.status));
  const past = rows.filter((r) => !["invited", "scheduled"].includes(r.status));
  return { active, past };
}

/* ------------------------------------------------------------------ *
 * Grouping and counting, shared by the board and its tests
 * ------------------------------------------------------------------ */

/** The calendar day an interview falls on, in ITS OWN timezone. */
export function dayKey(r: InterviewRow): string {
  if (!r.scheduled_at) return "";
  // en-CA gives yyyy-mm-dd, which sorts correctly as a string.
  return new Date(r.scheduled_at).toLocaleDateString("en-CA", {
    timeZone: r.timezone || "Africa/Lagos"
  });
}

export function dayLabel(r: InterviewRow): string {
  if (!r.scheduled_at) return "Time to be confirmed";
  return new Date(r.scheduled_at).toLocaleDateString("en-GB", {
    timeZone: r.timezone || "Africa/Lagos",
    weekday: "long", day: "numeric", month: "long"
  });
}

export function timeLabel(r: InterviewRow): string {
  if (!r.scheduled_at) return "";
  return new Date(r.scheduled_at).toLocaleTimeString("en-GB", {
    timeZone: r.timezone || "Africa/Lagos",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
}

/**
 * Group into days, earliest first, with unscheduled interviews last.
 *
 * Unscheduled ones go at the end rather than the start: an interview with no
 * time is an outstanding task, not the first thing you need on a morning when
 * eleven people are coming in.
 */
export function groupByDay(rows: InterviewRow[]): { key: string; label: string; rows: InterviewRow[] }[] {
  const map = new Map<string, InterviewRow[]>();
  for (const r of rows) {
    const k = dayKey(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a < b ? -1 : 1))
    .map(([key, group]) => ({
      key,
      label: dayLabel(group[0]),
      rows: group.slice().sort((x, y) =>
        String(x.scheduled_at ?? "").localeCompare(String(y.scheduled_at ?? "")))
    }));
}

/**
 * The four numbers worth seeing before the list.
 *
 * "Needs an outcome" is the one that catches real neglect: an interview that
 * happened, was never scored, and is holding an application at interviewing
 * where nobody is looking at it.
 */
export function interviewStats(rows: InterviewRow[], now = new Date()) {
  const today = now.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const active = rows.filter((r) => ["invited", "scheduled"].includes(r.status));
  return {
    today: active.filter((r) => dayKey(r) === today).length,
    next7: active.filter((r) => {
      if (!r.scheduled_at) return false;
      const t = new Date(r.scheduled_at);
      return t >= now && t <= weekEnd;
    }).length,
    unscheduled: active.filter((r) => !r.scheduled_at).length,
    /**
     * Interviews whose time has passed while the status still says scheduled.
     *
     * Nothing moves these on its own: the status only changes when somebody
     * marks a no-show or saves a review. They were sitting at the top of the
     * live list for weeks, counted as upcoming, holding their applications at
     * interviewing. This is the number that tells you to go and close them.
     */
    pastDue: active.filter((r) => !!r.scheduled_at && new Date(r.scheduled_at) < now).length,
    needsOutcome: rows.filter((r) => needsAttention(r, now)).length
  };
}

/** Happened but unresolved: either unscored, or still open after its time. */
export function needsAttention(r: InterviewRow, now = new Date()): boolean {
  if (["completed", "no_show"].includes(r.status) && r.outcome === "pending") return true;
  if (["invited", "scheduled"].includes(r.status) && r.scheduled_at && new Date(r.scheduled_at) < now) return true;
  return false;
}

/**
 * A phone number reduced to the part people actually type.
 *
 * Numbers are stored in international form, +2348165285609, but nobody
 * searches that way: they type the number as it appears on a CV, 0816 528
 * 5609. Comparing the raw digits failed, because "0816528" is nowhere inside
 * "2348165285609". Dropping a leading country code or trunk zero from both
 * sides makes the two forms the same number.
 */
function phoneTail(v: string): string {
  return String(v ?? "").replace(/\D/g, "").replace(/^(?:234|0)/, "");
}

/** Rows matching the board's filters. Pure, so it can be tested directly. */
export function filterRows(rows: InterviewRow[], f: {
  q?: string; job?: string; status?: string; day?: string; needsOutcome?: boolean;
}): InterviewRow[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return rows.filter((r) => {
    if (f.job && r.jobId !== f.job) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.day && dayKey(r) !== f.day) return false;
    if (f.needsOutcome && !needsAttention(r)) return false;
    if (!q) return true;
    const digits = q.replace(/\D/g, "");
    return (
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.jobTitle.toLowerCase().includes(q) ||
      (digits.length >= 3 && phoneTail(r.phone).includes(phoneTail(digits)))
    );
  });
}

/**
 * One row per interview, for the spreadsheet people actually plan from.
 *
 * The date goes out as yyyy-mm-dd as well as a readable day, because a
 * spreadsheet sorts the first correctly and a person reads the second. A
 * single "Thursday 8 October" column does neither, and loses the year.
 *
 * Phone numbers are prefixed with an apostrophe so Excel keeps them as text.
 * Without it +2348165285609 is read as a formula and shows as an error.
 */
export function toCsv(rows: InterviewRow[]): string {
  const head = ["Date", "Day", "Time", "Timezone", "Candidate", "Email", "Phone", "Role",
                "Company", "Round", "Mode", "Minutes", "Where", "Status", "Outcome", "Has CV"];
  const cell = (v: any) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => [
    dayKey(r), r.scheduled_at ? dayLabel(r) : "To be confirmed", timeLabel(r), r.timezone,
    r.name, r.email, r.phone ? `'${r.phone}` : "", r.jobTitle, r.company,
    r.round, r.mode.replace(/_/g, " "), r.duration_min ?? "",
    r.location_or_link, r.status, r.outcome, r.resumeUrl ? "yes" : "no"
  ].map(cell).join(","));
  return [head.join(","), ...body].join("\r\n");
}
