import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "recruiter" && profile?.role !== "admin") redirect("/");
  return (
    <>
      <Sidebar
        portal="Recruiter"
        primary={{ href: "/portal/recruiter/pool", label: "Browse pool" }}
        items={[{"href": "/portal/recruiter", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/recruiter/pool", "label": "Talent Pool", "icon": "\u265f"}, {"href": "/portal/recruiter/jobs", "label": "Jobs", "icon": "\u25a4"}, {"href": "/portal/recruiter/shortlists", "label": "Shortlists", "icon": "\u25a7"}, {"href": "/portal/recruiter/verifications", "label": "Verifications", "icon": "\u2713"}]}
      />
      <main className="flex-1 p-8 lg:p-10 max-w-[1200px]">{children}</main>
    </>
  );
}
