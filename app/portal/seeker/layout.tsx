import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "job_seeker" && profile?.role !== "admin") redirect("/");
  return (
    <>
      <Sidebar
        portal="Job Seeker"
        primary={{ href: "/portal/seeker/profile", label: "Complete profile" }}
        items={[{"href": "/portal/seeker", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/seeker/profile", "label": "My Profile", "icon": "\u25d4"}, {"href": "/portal/seeker/jobs", "label": "Jobs", "icon": "\u25a4"}, {"href": "/portal/seeker/applications", "label": "Applications", "icon": "\u2709"}, {"href": "/portal/seeker/trainings", "label": "Trainings", "icon": "\u25b6"}, {"href": "/portal/seeker/ai-tools", "label": "AI Tools", "icon": "\u2726"}, {"href": "/portal/seeker/subscription", "label": "Subscription", "icon": "\u25c8"}]}
      />
      <main className="flex-1 p-8 lg:p-10 max-w-[1200px]">{children}</main>
    </>
  );
}
