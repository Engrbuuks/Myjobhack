import { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewRow } from "@/components/InterviewDesk";

export async function assembleInterviewRows(client: SupabaseClient, interviews: any[]): Promise<InterviewRow[]> {
  return Promise.all(
    interviews.map(async (iv) => {
      const [{ data: p }, { data: j }] = await Promise.all([
        client.from("profiles").select("full_name, email").eq("id", iv.talent_id).single(),
        client.from("jobs").select("title").eq("id", iv.job_id).single()
      ]);
      return {
        id: iv.id, status: iv.status, outcome: iv.outcome, round: iv.round,
        mode: iv.mode, scheduled_at: iv.scheduled_at, duration_min: iv.duration_min,
        location_or_link: iv.location_or_link, calendly_url: iv.calendly_url,
        scorecard: iv.scorecard ?? [], feedback: iv.feedback ?? "",
        name: p?.full_name ?? "—", email: p?.email ?? "", jobTitle: j?.title ?? "Role"
      };
    })
  );
}

export function splitUpcoming(rows: InterviewRow[]) {
  const active = rows.filter((r) => ["invited", "scheduled"].includes(r.status));
  const past = rows.filter((r) => !["invited", "scheduled"].includes(r.status));
  return { active, past };
}
