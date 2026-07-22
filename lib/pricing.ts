import { createAdminClient } from "@/lib/supabase/admin";

export type Pricing = {
  assessment_per_candidate_ngn: number;
  assessment_per_candidate_usd: number;
  elite_premium_ngn: number;
  elite_premium_usd: number;
  placement_elite_percent: number;      // % applied to the chosen basis for an Elite hire
  placement_basis: string;              // 'annual' | 'monthly' | 'multiple'
  placement_multiple: number;           // when basis is 'multiple': months of salary charged
  placement_general_ngn: number;        // flat fee for a general hire
  elite_unlock_premium_ngn: number;     // premium to unlock an Elite profile
  elite_free_assessments: number;       // capped free assessments for Elite members
  job_assessment_per_candidate_ngn: number; // employer pays per finalist for a job-specific test
};

const DEFAULTS: Pricing = {
  assessment_per_candidate_ngn: 3500, assessment_per_candidate_usd: 3,
  elite_premium_ngn: 5000, elite_premium_usd: 4,
  placement_elite_percent: 10, placement_basis: "annual", placement_multiple: 1,
  placement_general_ngn: 25000,
  elite_unlock_premium_ngn: 5000, elite_free_assessments: 3,
  job_assessment_per_candidate_ngn: 5000
};

export async function getPricing(): Promise<Pricing> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle();
    return { ...DEFAULTS, ...(data?.value ?? {}) };
  } catch {
    return DEFAULTS;
  }
}
