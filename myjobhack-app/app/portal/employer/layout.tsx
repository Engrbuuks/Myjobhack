import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "employer" && profile?.role !== "admin") redirect("/");
  return (
    <>
      <Sidebar
        portal="Employer"
        primary={{ href: "/portal/employer/jobs/new", label: "Post a job" }}
        items={[{"href": "/portal/employer", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/employer/jobs", "label": "My Jobs", "icon": "\u25a4"}, {"href": "/portal/employer/applicants", "label": "Applicants", "icon": "\u265f"}, {"href": "/portal/employer/interviews", "label": "Interviews", "icon": "\u25f7"}, {"href": "/portal/employer/forms", "label": "Application Forms", "icon": "\u25a7"}, {"href": "/portal/employer/company", "label": "Company", "icon": "\u25ce"}, {"href": "/portal/employer/billing", "label": "Billing", "icon": "\u25c8"}]}
      />
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 max-w-[1200px] w-full">{children}</main>
    </>
  );
}
