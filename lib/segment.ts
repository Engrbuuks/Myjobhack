import { SupabaseClient } from "@supabase/supabase-js";

export type SegmentFilters = {
  niche?: string;
  goal?: string;
  expertise?: string;
  level?: string;
  mode?: string;
  reloc?: string;
  min_completion?: string;
  verified?: string;
};

export function filtersFromSearchParams(sp: Record<string, string | string[] | undefined>): SegmentFilters {
  const g = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  return {
    niche: g("niche"), goal: g("goal"), expertise: g("expertise"),
    level: g("level"), mode: g("mode"), reloc: g("reloc"),
    min_completion: g("min_completion"), verified: g("verified")
  };
}

/** Returns talent rows (profile_id, plus profile fields) matching a CRM segment. */
export async function querySegment(supabase: SupabaseClient, f: SegmentFilters) {
  let ids: string[] | null = null;
  if (f.expertise) {
    const { data } = await supabase
      .from("talent_expertise").select("talent_id").eq("taxonomy_id", f.expertise);
    ids = (data ?? []).map((r) => r.talent_id);
    if (ids.length === 0) return [];
  }

  let q = supabase.from("talent_profiles").select(
    "profile_id, niche_id, career_goal_id, headline, years_experience, salary_min, salary_max, salary_currency, expected_role_level, preferred_work_mode, relocation, profile_completion, verification, resume_document_id"
  );
  if (ids) q = q.in("profile_id", ids);
  if (f.niche) q = q.eq("niche_id", f.niche);
  if (f.goal) q = q.eq("career_goal_id", f.goal);
  if (f.level) q = q.eq("expected_role_level", f.level);
  if (f.mode) q = q.eq("preferred_work_mode", f.mode);
  if (f.reloc) q = q.eq("relocation", f.reloc);
  if (f.min_completion) q = q.gte("profile_completion", Number(f.min_completion));
  if (f.verified === "yes") q = q.eq("verification", "verified");

  const { data: talents } = await q.order("profile_completion", { ascending: false }).limit(500);
  if (!talents || talents.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, country, city")
    .in("id", talents.map((t) => t.profile_id));
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return talents.map((t) => ({ ...t, profile: pmap.get(t.profile_id) ?? null }));
}
