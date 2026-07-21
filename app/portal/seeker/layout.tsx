import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name, country, city").eq("id", user.id).single();
  if (!["job_seeker", "elite_member", "admin"].includes(profile?.role ?? "")) redirect("/");

  // Location is compulsory. Anyone missing country or city/state is sent to
  // complete their profile before they can use the rest of the portal.
  const missingLocation = profile?.role !== "admin" && (!profile?.country?.trim() || !profile?.city?.trim());
  const path = headers().get("x-pathname") || headers().get("x-invoke-path") || "";
  if (missingLocation && !path.includes("/portal/seeker/profile")) {
    redirect("/portal/seeker/profile?complete=location");
  }
  return (
    <>
      <Sidebar
        portal="Job Seeker"
        primary={{ href: "/portal/seeker/profile", label: "Complete profile" }}
        items={[{"href": "/portal/seeker", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/seeker/profile", "label": "My Profile", "icon": "\u25d4"}, {"href": "/portal/seeker/assessment", "label": "Prove competency", "icon": "\u2726"}, {"href": "/portal/seeker/jobs", "label": "Jobs", "icon": "\u25a4"}, {"href": "/portal/seeker/applications", "label": "Applications", "icon": "\u2709"}, {"href": "/portal/seeker/trainings", "label": "Trainings", "icon": "\u25b6"}, {"href": "/portal/seeker/ai-tools", "label": "Toolkit", "icon": "\u2726"}, {"href": "/portal/seeker/subscription", "label": "Subscription", "icon": "\u25c8"}]}
      />
      <main className="flex-1 p-8 lg:p-10 max-w-[1200px]">{children}</main>
    </>
  );
}
