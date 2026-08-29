/**
 * Graded staff access.
 *
 * The seven roles decide WHICH PORTAL someone sees. Permissions decide what
 * they can do once inside the staff portal — because "admin" was previously
 * all-or-nothing, and giving a coordinator the ability to review applicants
 * also gave them pricing, refunds and the power to delete accounts.
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE:
 *
 * 1. NULL permissions means unrestricted. Every admin that exists today has
 *    NULL, so deploying this changes nobody's access. Restriction is opt-in.
 *
 * 2. Hiding a menu item is not access control. Every capability must be
 *    checked in the API route that performs the action — `requirePermission`
 *    in permissions.server.ts is that check. The nav gating here is a courtesy
 *    so people aren't shown doors that won't open.
 *
 * This file is deliberately free of server-only imports: it is used by client
 * components too, and pulling `next/headers` in here breaks the build.
 */

export const CAPABILITIES = {
  "applicants.view":      "See applicants and their answers",
  "applicants.manage":    "Move applicants through stages, shortlist and reject",
  "applicants.contact":   "Email applicants and request answers",
  "applicants.resume":    "Open CVs and résumé documents",

  "jobs.view":            "See job postings",
  "jobs.manage":          "Create, edit, close and delete jobs",

  "pool.view":            "Browse the talent pool",
  "pool.export":          "Export candidate lists and contact details",
  "pool.search":          "Search CV text across the pool",

  "trainings.manage":     "Create and run trainings",
  "assessments.manage":   "Set and score assessments",

  "intelligence.view":    "See pool intelligence and revenue figures",
  "benchmarks.manage":    "Fetch and edit market skill benchmarks",

  "pricing.manage":       "Change prices, plans and coupons",
  "payments.manage":      "Record payments, invoices and placement fees",
  "payouts.manage":       "Approve partner and recruiter payouts",

  "users.view":           "See the user list",
  "users.manage":         "Create users, change roles and permissions",
  "settings.manage":      "Change platform settings and integrations"
} as const;

export type Capability = keyof typeof CAPABILITIES;

export const CAPABILITY_GROUPS: { label: string; caps: Capability[] }[] = [
  { label: "Applicants", caps: ["applicants.view", "applicants.manage", "applicants.contact", "applicants.resume"] },
  { label: "Jobs", caps: ["jobs.view", "jobs.manage"] },
  { label: "Talent pool", caps: ["pool.view", "pool.search", "pool.export"] },
  { label: "Learning", caps: ["trainings.manage", "assessments.manage"] },
  { label: "Insight", caps: ["intelligence.view", "benchmarks.manage"] },
  { label: "Money", caps: ["pricing.manage", "payments.manage", "payouts.manage"] },
  { label: "Administration", caps: ["users.view", "users.manage", "settings.manage"] }
];

/**
 * Starting points, not straitjackets — every preset can be adjusted per person.
 * Chosen to match jobs people actually do rather than to look tidy.
 */
export const PRESETS: { id: string; label: string; description: string; caps: Capability[] | null }[] = [
  {
    id: "owner", label: "Full access",
    description: "Everything, including money and user management. Give this sparingly.",
    caps: null                        // null = unrestricted
  },
  {
    id: "manager", label: "Hiring manager",
    description: "Runs hiring end to end, and can see the business picture. No pricing, payouts or user management.",
    caps: ["applicants.view", "applicants.manage", "applicants.contact", "applicants.resume",
           "jobs.view", "jobs.manage", "pool.view", "pool.search", "pool.export",
           "trainings.manage", "assessments.manage", "intelligence.view", "users.view"]
  },
  {
    id: "recruiter", label: "Recruiter",
    description: "Works applicants and the pool. Can contact candidates but not change jobs or see revenue.",
    caps: ["applicants.view", "applicants.manage", "applicants.contact", "applicants.resume",
           "jobs.view", "pool.view", "pool.search"]
  },
  {
    id: "coordinator", label: "Coordinator",
    description: "Reviews and organises applicants. Cannot email candidates or export contact details.",
    caps: ["applicants.view", "applicants.manage", "applicants.resume", "jobs.view", "pool.view"]
  },
  {
    id: "trainer_admin", label: "Training lead",
    description: "Runs trainings and assessments, and can see where the pool is weak.",
    caps: ["trainings.manage", "assessments.manage", "pool.view", "intelligence.view",
           "benchmarks.manage", "applicants.view"]
  },
  {
    id: "finance", label: "Finance",
    description: "Payments, invoices, pricing and payouts. No candidate data.",
    caps: ["pricing.manage", "payments.manage", "payouts.manage", "intelligence.view", "users.view"]
  },
  {
    id: "viewer", label: "Read only",
    description: "Can look at applicants and jobs. Cannot change, contact or export anything.",
    caps: ["applicants.view", "jobs.view", "pool.view"]
  }
];

/** Does this profile hold a capability? NULL permissions = unrestricted. */
export function can(
  profile: { role?: string | null; permissions?: string[] | null } | null | undefined,
  cap: Capability
): boolean {
  if (!profile) return false;
  if (!["admin", "recruiter"].includes(profile.role ?? "")) return false;
  if (profile.permissions == null) return true;      // unrestricted
  return profile.permissions.includes(cap);
}

/** Which preset matches this list, if any — for showing a friendly label. */
export function presetFor(permissions: string[] | null | undefined): string {
  if (permissions == null) return "owner";
  const sorted = [...permissions].sort().join(",");
  const match = PRESETS.find((p) => p.caps && [...p.caps].sort().join(",") === sorted);
  return match?.id ?? "custom";
}

/** Nav entries hidden when the capability is absent. Convenience, not security. */
export const NAV_CAPABILITY: Record<string, Capability> = {
  "/portal/admin/users": "users.view",
  "/portal/admin/pricing": "pricing.manage",
  "/portal/admin/payments": "payments.manage",
  "/portal/admin/payouts": "payouts.manage",
  "/portal/admin/pool": "pool.view",
  "/portal/admin/cv-search": "pool.search",
  "/portal/admin/intelligence": "intelligence.view",
  "/portal/admin/trainings": "trainings.manage",
  "/portal/admin/jobs": "jobs.view",
  "/portal/admin/settings": "settings.manage"
};
