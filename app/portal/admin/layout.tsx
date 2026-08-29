import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { can, NAV_CAPABILITY, type Capability } from "@/lib/permissions";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles")
    .select("role, full_name, permissions").eq("id", user.id).single();
  // Recruiters with staff capabilities belong in here too — the previous check
  // compared "admin" against itself twice, which excluded them by accident.
  if (!["admin", "recruiter"].includes(profile?.role ?? "")) redirect("/");
  return (
    <>
      <Sidebar
        portal="Admin"
        primary={{ href: "/portal/admin/invites", label: "Send training invites" }}
        items={([{"href": "/portal/admin", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/admin/pool", "label": "Talent CRM", "icon": "\u265f"}, {"href": "/portal/admin/insights", "label": "Pool Insights", "icon": "\u25f0"}, {"href": "/portal/admin/cv-search", "label": "Search CVs", "icon": "\u2315"}, {"href": "/portal/admin/intelligence", "label": "Intelligence", "icon": "\u25c9"}, {"href": "/portal/admin/staff", "label": "Team & Access", "icon": "\u26bf"}, {"href": "/portal/admin/users", "label": "Users", "icon": "\u25cc"}, {"href": "/portal/admin/jobs", "label": "Jobs", "icon": "\u25a4"}, {"href": "/portal/admin/interviews", "label": "Interviews", "icon": "\u25f7"}, {"href": "/portal/admin/trainings", "label": "Trainings", "icon": "\u25b6"}, {"href": "/portal/admin/invites", "label": "Invite Engine", "icon": "\u2709"}, {"href": "/portal/admin/campaigns", "label": "Campaigns", "icon": "\u2708"}, {"href": "/portal/admin/pipeline", "label": "Employer Pipeline", "icon": "◱"}, {"href": "/portal/admin/funnel", "label": "Funnel", "icon": "\u25bd"}, {"href": "/portal/admin/verifications", "label": "Verifications", "icon": "\u2713"}, {"href": "/portal/admin/payments", "label": "Payments", "icon": "\u25c8"}, {"href": "/portal/admin/invoices", "label": "Invoices", "icon": "\u2707"}, {"href": "/portal/admin/placements", "label": "Placements", "icon": "⭐"}, {"href": "/portal/admin/retention", "label": "Retention", "icon": "♥"}, {"href": "/portal/admin/invites-links", "label": "Invite Links", "icon": "✉"}, {"href": "/portal/admin/pricing", "label": "Pricing", "icon": "\u20a6"}, {"href": "/portal/admin/coupons", "label": "Coupons", "icon": "\u2702"}, {"href": "/portal/admin/settings", "label": "Settings", "icon": "\u2699"}]
        // Hide what this person cannot reach. This is a courtesy, not the
        // control — every one of these pages and its API routes check the
        // capability themselves.
        ).filter((i) => {
          const needed = NAV_CAPABILITY[i.href] as Capability | undefined;
          return !needed || can(profile, needed);
        })}
      />
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 max-w-[1200px] w-full">{children}</main>
    </>
  );
}
