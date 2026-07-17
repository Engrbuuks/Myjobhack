import { SupabaseClient } from "@supabase/supabase-js";

export async function getMyOrg(supabase: SupabaseClient, userId: string) {
  const { data: membership } = await supabase
    .from("org_members").select("org_id, org_role").eq("profile_id", userId).limit(1).maybeSingle();
  if (!membership) return null;
  const { data: org } = await supabase
    .from("organizations").select("*").eq("id", membership.org_id).single();
  return org ? { ...org, org_role: membership.org_role } : null;
}
