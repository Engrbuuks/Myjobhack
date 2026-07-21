import { createAdminClient } from "@/lib/supabase/admin";

export type Pricing = {
  assessment_per_candidate_ngn: number;
  assessment_per_candidate_usd: number;
  elite_premium_ngn: number;
  elite_premium_usd: number;
};

const DEFAULTS: Pricing = {
  assessment_per_candidate_ngn: 3500, assessment_per_candidate_usd: 3,
  elite_premium_ngn: 5000, elite_premium_usd: 4
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
