import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "trainer" && profile?.role !== "admin") redirect("/");
  return (
    <>
      <Sidebar
        portal="Trainer"
        primary={{ href: "/portal/trainer/trainings/new", label: "Create training" }}
        items={[{"href": "/portal/trainer", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/trainer/trainings", "label": "My Trainings", "icon": "\u25b6"}, {"href": "/portal/trainer/courses", "label": "LMS Courses", "icon": "\u25a7"}, {"href": "/portal/trainer/learners", "label": "Learners", "icon": "\u265f"}]}
      />
      <main className="flex-1 p-8 lg:p-10 max-w-[1200px]">{children}</main>
    </>
  );
}
