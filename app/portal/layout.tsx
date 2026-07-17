import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationsBell } from "@/components/NotificationsBell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <div className="flex min-h-screen">{children}<NotificationsBell /></div>;
}
