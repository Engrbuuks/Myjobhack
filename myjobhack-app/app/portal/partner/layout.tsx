import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "partner" && profile?.role !== "admin") redirect("/");
  return (
    <>
      <Sidebar
        portal="Partner"
        primary={{ href: "/portal/partner/opportunities", label: "View opportunities" }}
        items={[{"href": "/portal/partner", "label": "Dashboard", "icon": "\u25a6"}, {"href": "/portal/partner/opportunities", "label": "Opportunities", "icon": "\u25a4"}, {"href": "/portal/partner/referrals", "label": "Referrals", "icon": "\u265f"}]}
      />
      <main className="flex-1 p-8 lg:p-10 max-w-[1200px]">{children}</main>
    </>
  );
}
