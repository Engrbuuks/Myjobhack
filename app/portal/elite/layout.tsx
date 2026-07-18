import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "elite_member" && profile?.role !== "admin") redirect("/");
  return (
    <>
      <Sidebar
        portal="Elite Member"
        primary={{ href: "/portal/elite/chapter", label: "My chapter" }}
        items={[{"href": "/portal/elite", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/elite/profile", "label": "My Profile", "icon": "\u25d4"}, {"href": "/portal/elite/chapter", "label": "My Chapter", "icon": "\u25ce"}, {"href": "/portal/elite/commons", "label": "The Commons", "icon": "\u273f"}, {"href": "/portal/elite/community", "label": "Directory", "icon": "\u265f"}, {"href": "/portal/elite/messages", "label": "Messages", "icon": "\u2709"}, {"href": "/portal/seeker/jobs", "label": "Priority Jobs", "icon": "\u25a4"}, {"href": "/portal/seeker/trainings", "label": "Trainings", "icon": "\u25b6"}, {"href": "/portal/seeker/ai-tools", "label": "AI Tools", "icon": "\u2726"}]}
      />
      <main className="flex-1 p-8 lg:p-10 max-w-[1200px]">{children}</main>
    </>
  );
}
