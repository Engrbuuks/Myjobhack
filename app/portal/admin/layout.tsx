import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "admin") redirect("/");
  return (
    <>
      <Sidebar
        portal="Admin"
        primary={{ href: "/portal/admin/invites", label: "Send training invites" }}
        items={[{"href": "/portal/admin", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/admin/pool", "label": "Talent CRM", "icon": "\u265f"}, {"href": "/portal/admin/insights", "label": "Pool Insights", "icon": "\u25f0"}, {"href": "/portal/admin/users", "label": "Users", "icon": "\u25cc"}, {"href": "/portal/admin/jobs", "label": "Jobs", "icon": "\u25a4"}, {"href": "/portal/admin/interviews", "label": "Interviews", "icon": "\u25f7"}, {"href": "/portal/admin/trainings", "label": "Trainings", "icon": "\u25b6"}, {"href": "/portal/admin/invites", "label": "Invite Engine", "icon": "\u2709"}, {"href": "/portal/admin/campaigns", "label": "Campaigns", "icon": "\u2708"}, {"href": "/portal/admin/funnel", "label": "Funnel", "icon": "\u25bd"}, {"href": "/portal/admin/verifications", "label": "Verifications", "icon": "\u2713"}, {"href": "/portal/admin/payments", "label": "Payments", "icon": "\u25c8"}, {"href": "/portal/admin/invoices", "label": "Invoices", "icon": "\u2707"}, {"href": "/portal/admin/placements", "label": "Placements", "icon": "⭐"}, {"href": "/portal/admin/invites-links", "label": "Invite Links", "icon": "✉"}, {"href": "/portal/admin/pricing", "label": "Pricing", "icon": "\u20a6"}, {"href": "/portal/admin/settings", "label": "Settings", "icon": "\u2699"}]}
      />
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 max-w-[1200px] w-full">{children}</main>
    </>
  );
}
