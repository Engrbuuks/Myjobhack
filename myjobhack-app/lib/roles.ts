export type UserRole =
  | "job_seeker" | "elite_member" | "employer" | "recruiter"
  | "trainer" | "partner" | "admin";

export const PORTAL_PATH: Record<UserRole, string> = {
  job_seeker: "/portal/seeker",
  elite_member: "/portal/elite",
  employer: "/portal/employer",
  recruiter: "/portal/recruiter",
  trainer: "/portal/trainer",
  partner: "/portal/partner",
  admin: "/portal/admin"
};

export const ROLE_LABEL: Record<UserRole, string> = {
  job_seeker: "Job Seeker",
  elite_member: "Elite Member",
  employer: "Employer",
  recruiter: "Recruiter",
  trainer: "Trainer",
  partner: "Partner",
  admin: "Admin"
};

export function portalFor(role: string | null | undefined): string {
  return PORTAL_PATH[(role as UserRole) ?? "job_seeker"] ?? "/portal/seeker";
}
