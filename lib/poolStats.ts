import { createAdminClient } from "@/lib/supabase/admin";

export type PoolFilters = {
  niche_id?: string;
  country?: string;
  state?: string;
  verification?: string;
  work_mode?: string;
  role_level?: string;
  years_bucket?: string;
};

export type Bucket = { key: string; label: string; count: number };

export type PoolStats = {
  totals: {
    all_users: number;
    talent: number;
    employers: number;
    elite: number;
    verified: number;
    with_resume: number;
    applied_at_least_once: number;
    marketing_contacts: number;
    total_pool: number;            // members + distinct guest applicants
    missing_location: number;      // talent with no country or no city/state
  };
  by_niche: Bucket[];
  by_country: Bucket[];
  by_role_level: Bucket[];
  by_work_mode: Bucket[];
  by_verification: Bucket[];
  by_state: Bucket[];
  by_years: Bucket[];          // experience buckets
  by_month: Bucket[];          // signups per month, last 12
  filtered_total: number;      // talent matching the current filters
};

function tally(rows: any[], key: string, labelMap?: Map<string, string>): Bucket[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r[key];
    const k = v === null || v === undefined || v === "" ? "—" : String(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([k, count]) => ({ key: k, label: labelMap?.get(k) ?? (k === "—" ? "Unspecified" : k), count }))
    .sort((a, b) => b.count - a.count);
}

function yearsBuckets(rows: any[]): Bucket[] {
  const b = { "0-2": 0, "3-5": 0, "6-10": 0, "10+": 0 };
  for (const r of rows) {
    const y = Number(r.years_experience ?? 0);
    if (y <= 2) b["0-2"]++; else if (y <= 5) b["3-5"]++; else if (y <= 10) b["6-10"]++; else b["10+"]++;
  }
  return [
    { key: "0-2", label: "0–2 years", count: b["0-2"] },
    { key: "3-5", label: "3–5 years", count: b["3-5"] },
    { key: "6-10", label: "6–10 years", count: b["6-10"] },
    { key: "10+", label: "10+ years", count: b["10+"] }
  ];
}

/** Fetch ALL rows past Supabase's 1000-row cap, page by page. */
async function fetchAll(admin: any, table: string, columns: string): Promise<any[]> {
  const out: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) {
      // A missing optional column (e.g. state before migration) shouldn't zero the dashboard.
      // Retry once without the optional columns.
      if (columns.includes("state") || columns.includes("years_experience")) {
        const safe = columns.split(",").map((c) => c.trim())
          .filter((c) => c !== "state" && c !== "years_experience").join(", ");
        const { data: d2 } = await admin.from(table).select(safe).range(from, from + PAGE - 1);
        if (d2?.length) out.push(...d2);
        if (!d2 || d2.length < PAGE) break;
        continue;
      }
      break;
    }
    if (data?.length) out.push(...data);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function getPoolStats(filters: PoolFilters = {}): Promise<PoolStats> {
  const admin = createAdminClient();

  // Taxonomy labels for niches
  const { data: tax } = await admin.from("taxonomies").select("id, label").eq("kind", "niche");
  const nicheLabel = new Map<string,string>((tax ?? []).map((t: any) => [t.id, t.label]));

  // All profiles (role + geography + created_at)
  const allProfiles = await fetchAll(admin, "profiles", "id, role, country, state, city, created_at");
  const talentProfiles = allProfiles.filter((p) => ["job_seeker", "elite_member"].includes(p.role));

  // Talent detail (niche, verification, work mode, level, resume)
  const tp = await fetchAll(admin, "talent_profiles", "profile_id, niche_id, verification, preferred_work_mode, expected_role_level, resume_document_id, years_experience");
  const tpById = new Map(tp.map((t: any) => [t.profile_id, t]));

  // Merge talent profile detail onto each talent record
  const talent = talentProfiles.map((p) => {
    const detail = tpById.get(p.id) ?? {};
    return { ...p, ...detail };
  });

  // Apply filters to the talent set
  const filtered = talent.filter((t: any) => {
    if (filters.niche_id && t.niche_id !== filters.niche_id) return false;
    if (filters.country && (t.country ?? "") !== filters.country) return false;
    if (filters.state && (t.state ?? "") !== filters.state) return false;
    if (filters.verification && (t.verification ?? "") !== filters.verification) return false;
    if (filters.work_mode && (t.preferred_work_mode ?? "") !== filters.work_mode) return false;
    if (filters.role_level && (t.expected_role_level ?? "") !== filters.role_level) return false;
    if (filters.years_bucket) {
      const y = Number(t.years_experience ?? 0);
      const inBucket =
        (filters.years_bucket === "0-2" && y <= 2) ||
        (filters.years_bucket === "3-5" && y >= 3 && y <= 5) ||
        (filters.years_bucket === "6-10" && y >= 6 && y <= 10) ||
        (filters.years_bucket === "10+" && y > 10);
      if (!inBucket) return false;
    }
    return true;
  });

  // Applications — distinct applicants
  const apps = await fetchAll(admin, "applications", "talent_id, guest_email");
  const applicantSet = new Set<string>();
  apps.forEach((a: any) => {
    if (a.talent_id) applicantSet.add(a.talent_id);
    else if (a.guest_email) applicantSet.add(`guest:${a.guest_email}`);
  });

  // Marketing contacts (with geography, so guests count in maps)
  let mc: any[] = [];
  try { mc = await fetchAll(admin, "marketing_contacts", "email, country, state, profile_id"); } catch { mc = []; }
  const mcCount = mc.length;

  // Combined pool = distinct members + guest applicants not already members
  const memberEmails = new Set(allProfiles.map((p: any) => p.id));
  const guestOnly = applicantSet.size; // already distinct member+guest above
  const totalPool = talent.length + (mc ?? []).filter((c: any) => !c.profile_id).length;

  // Signups per month, last 12
  const now = new Date();
  const months: Bucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    const count = allProfiles.filter((p) => (p.created_at ?? "").startsWith(key)).length;
    months.push({ key, label, count });
  }

  return {
    totals: {
      all_users: allProfiles.length,
      talent: talent.length,
      employers: allProfiles.filter((p) => p.role === "employer").length,
      elite: allProfiles.filter((p) => p.role === "elite_member").length,
      verified: talent.filter((t: any) => t.verification === "verified").length,
      with_resume: talent.filter((t: any) => !!t.resume_document_id).length,
      applied_at_least_once: applicantSet.size,
      marketing_contacts: mcCount ?? 0,
      total_pool: totalPool,
      missing_location: talent.filter((t: any) => !(t.country ?? "").trim() || !(t.state ?? "").trim() && !(t.city ?? "").trim()).length
    },
    by_niche: tally(filtered, "niche_id", nicheLabel).slice(0, 12),
    by_country: tally(filtered, "country").slice(0, 12),
    by_state: tally(filtered, "state").slice(0, 15),
    by_role_level: tally(filtered, "expected_role_level").slice(0, 8),
    by_work_mode: tally(filtered, "preferred_work_mode"),
    by_verification: tally(filtered, "verification"),
    by_years: yearsBuckets(filtered),
    by_month: months,
    filtered_total: filtered.length
  };
}
