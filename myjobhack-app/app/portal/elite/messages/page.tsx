import { createClient } from "@/lib/supabase/server";
import { DashHero } from "@/components/DashHero";
import { MessagesDesk } from "@/components/MessagesDesk";

export default async function MessagesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("elite_memberships")
    .select("status").eq("talent_id", user!.id).maybeSingle();
  if (me?.status !== "verified") {
    return <DashHero kicker="Messages" title="Members only." sub="Messaging opens when your membership is verified." />;
  }

  const { data: conns } = await supabase.from("dm_connections")
    .select("*").or(`requester_id.eq.${user!.id},recipient_id.eq.${user!.id}`)
    .neq("status", "declined").order("created_at", { ascending: false });

  const otherIds = Array.from(new Set((conns ?? []).map((c) =>
    c.requester_id === user!.id ? c.recipient_id : c.requester_id)));
  const [{ data: profs }, { data: talents }] = await Promise.all([
    otherIds.length ? supabase.from("profiles").select("id, full_name").in("id", otherIds) : Promise.resolve({ data: [] as any[] }),
    otherIds.length ? supabase.from("talent_profiles").select("profile_id, headline").in("profile_id", otherIds) : Promise.resolve({ data: [] as any[] })
  ]);
  const pmap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
  const hmap = new Map((talents ?? []).map((t) => [t.profile_id, t.headline]));

  const connections = (conns ?? []).map((c) => {
    const otherId = c.requester_id === user!.id ? c.recipient_id : c.requester_id;
    return {
      id: c.id, status: c.status, incoming: c.recipient_id === user!.id,
      otherId, otherName: pmap.get(otherId) ?? "Member",
      otherHeadline: hmap.get(otherId) ?? "Elite member"
    };
  });

  return (
    <>
      <DashHero kicker="Private lines" title="Messages."
        sub="Consent first, always — a conversation opens only when both members agree to it." />
      <MessagesDesk connections={connections} meId={user!.id} />
    </>
  );
}
