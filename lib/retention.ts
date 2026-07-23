import { createAdminClient } from "@/lib/supabase/admin";

/**
 * RETENTION — the thing no competitor can copy.
 *
 * Job boards lose the candidate at application. Assessment vendors never see
 * the outcome. Agencies have the placement but no structured pre-hire data.
 * We hold both halves, so we can learn which pre-hire signals actually predict
 * who is still there at 90 days.
 *
 * Honest note on method: with few placements this is a weak signal, and we say
 * so rather than dressing a guess as a prediction. Confidence rises with volume.
 */

export type RetentionStats = {
  total_placements: number;
  reached_90: number;
  left_early: number;
  rate_90: number | null;          // null when there is not enough data
  by_band: { band: string; placements: number; retained: number; rate: number }[];
  confidence: "none" | "low" | "moderate" | "good";
  sample_note: string;
};

/** How much we trust the numbers, given how many completed placements we have. */
function confidenceFor(n: number): RetentionStats["confidence"] {
  if (n < 10) return "none";
  if (n < 40) return "low";
  if (n < 150) return "moderate";
  return "good";
}

export async function getRetentionStats(): Promise<RetentionStats> {
  const admin = createAdminClient();

  const { data: placements } = await admin.from("placements")
    .select("id, talent_id, retention_status, created_at, start_date");

  const all = placements ?? [];
  // Only placements old enough to have reached the 90-day mark can be judged.
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  const mature = all.filter(p => new Date(p.start_date ?? p.created_at) <= cutoff);

  const reached = mature.filter(p => p.retention_status === "retained_90").length;
  const left = mature.filter(p => ["left_early", "replaced"].includes(p.retention_status)).length;
  const judged = reached + left;

  // Break the rate down by the competency band they held when hired.
  const byBand = new Map<string, { placements: number; retained: number }>();
  for (const p of mature) {
    const { data: tp } = await admin.from("talent_profiles")
      .select("competency_band").eq("profile_id", p.talent_id).maybeSingle();
    const band = tp?.competency_band ?? "unassessed";
    const cur = byBand.get(band) ?? { placements: 0, retained: 0 };
    if (["retained_90", "left_early", "replaced"].includes(p.retention_status)) {
      cur.placements += 1;
      if (p.retention_status === "retained_90") cur.retained += 1;
    }
    byBand.set(band, cur);
  }

  const confidence = confidenceFor(judged);
  return {
    total_placements: all.length,
    reached_90: reached,
    left_early: left,
    rate_90: judged >= 10 ? Math.round((reached / judged) * 100) : null,
    by_band: Array.from(byBand.entries())
      .filter(([, v]) => v.placements > 0)
      .map(([band, v]) => ({
        band, placements: v.placements, retained: v.retained,
        rate: Math.round((v.retained / v.placements) * 100)
      }))
      .sort((a, b) => b.placements - a.placements),
    confidence,
    sample_note:
      confidence === "none"
        ? `Only ${judged} placement${judged === 1 ? "" : "s"} have reached 90 days. Not enough to predict from yet — we report it rather than guess.`
        : confidence === "low"
          ? `Based on ${judged} completed placements. Treat as indicative, not predictive.`
          : confidence === "moderate"
            ? `Based on ${judged} completed placements. Reasonably reliable at band level.`
            : `Based on ${judged} completed placements. Strong enough to quote to employers.`
  };
}

/**
 * A candidate's predicted retention. Deliberately conservative: where we lack
 * evidence we say so instead of inventing a number.
 */
export async function getRetentionScore(talentId: string): Promise<{
  score: number | null; band: string | null; basis: string;
}> {
  const admin = createAdminClient();
  const { data: tp } = await admin.from("talent_profiles")
    .select("competency_band, profile_completion").eq("profile_id", talentId).maybeSingle();
  if (!tp) return { score: null, band: null, basis: "No profile." };

  const stats = await getRetentionStats();
  const band = tp.competency_band ?? null;

  if (stats.confidence === "none") {
    return { score: null, band, basis: "Not enough placement history yet to predict retention." };
  }

  const bandRow = stats.by_band.find(b => b.band === (band ?? "unassessed"));
  if (!bandRow || bandRow.placements < 5) {
    return {
      score: stats.rate_90,
      band,
      basis: `Platform average across ${stats.reached_90 + stats.left_early} placements — too few in this band to be specific.`
    };
  }

  return {
    score: bandRow.rate,
    band,
    basis: `${bandRow.retained} of ${bandRow.placements} candidates in the ${band} band stayed past 90 days.`
  };
}
