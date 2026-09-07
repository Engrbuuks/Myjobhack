import { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewRow } from "@/components/InterviewDesk";

export async function assembleInterviewRows(client: SupabaseClient, interviews: any[]): Promise<InterviewRow[]> {
  /**
   * Names come from the profile OR from the interview row itself.
   *
   * This used to look the name up from profiles by talent_id only. Guest
   * applicants have no profile, so the lookup returned nothing and every
   * bulk-scheduled interview showed as a dash with no name, no email and no
   * way to tell one row from another. Guest details live on the interview
   * itself, so fall back to those.
   *
   * The lookups are also batched now. One query per interview meant a page of
   * forty interviews fired eighty round trips.
   */
  const talentIds = Array.from(new Set(interviews.map((iv) => iv.talent_id).filter(Boolean)));
  const jobIds = Array.from(new Set(interviews.map((iv) => iv.job_id).filter(Boolean)));

  const profRes: any = talentIds.length
    ? await client.from("profiles").select("id, full_name, email, phone").in("id", talentIds)
    : { data: [] };
  const jobRes: any = jobIds.length
    ? await client.from("jobs").select("id, title").in("id", jobIds)
    : { data: [] };
  const profs: any[] = profRes.data ?? [];
  const jobs: any[] = jobRes.data ?? [];

  const pById = new Map(profs.map((p: any) => [p.id, p]));
  const jById = new Map(jobs.map((j: any) => [j.id, j]));

  return interviews.map((iv) => {
    const p = iv.talent_id ? pById.get(iv.talent_id) : null;
    return {
      id: iv.id, status: iv.status, outcome: iv.outcome, round: iv.round,
      mode: iv.mode, scheduled_at: iv.scheduled_at, duration_min: iv.duration_min,
      location_or_link: iv.location_or_link, calendly_url: iv.calendly_url,
      scorecard: iv.scorecard ?? [], feedback: iv.feedback ?? "",
      name: p?.full_name ?? iv.guest_name ?? "Unnamed candidate",
      email: p?.email ?? iv.guest_email ?? "",
      phone: p?.phone ?? "",
      isGuest: !iv.talent_id,
      jobTitle: jById.get(iv.job_id)?.title ?? "Role"
    };
  });
}

export function splitUpcoming(rows: InterviewRow[]) {
  const active = rows.filter((r) => ["invited", "scheduled"].includes(r.status));
  const past = rows.filter((r) => !["invited", "scheduled"].includes(r.status));
  return { active, past };
}
