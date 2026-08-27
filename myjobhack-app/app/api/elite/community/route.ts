import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function verifiedElite() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: em } = await admin.from("elite_memberships")
    .select("id").eq("talent_id", user.id).eq("status", "verified").maybeSingle();
  return em ? user : null;
}

export async function POST(request: Request) {
  const user = await verifiedElite();
  if (!user) return NextResponse.json({ error: "Verified Elite members only" }, { status: 403 });
  const admin = createAdminClient();
  const b = await request.json();

  if (b.action === "connect") {
    if (!b.recipient_id || b.recipient_id === user.id)
      return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
    const { data: existing } = await admin.from("dm_connections").select("id, status")
      .or(`and(requester_id.eq.${user.id},recipient_id.eq.${b.recipient_id}),and(requester_id.eq.${b.recipient_id},recipient_id.eq.${user.id})`)
      .maybeSingle();
    if (existing) return NextResponse.json({ ok: true, status: existing.status, already: true });
    const { error } = await admin.from("dm_connections")
      .insert({ requester_id: user.id, recipient_id: b.recipient_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: me } = await admin.from("profiles").select("full_name").eq("id", user.id).single();
    await admin.from("notifications").insert({
      profile_id: b.recipient_id, title: "Connection request ✦",
      body: `${me?.full_name ?? "An Elite member"} wants to connect. Messaging opens only if you accept.`,
      link: "/portal/elite/messages"
    });
    return NextResponse.json({ ok: true, status: "pending" });
  }

  if (b.action === "respond") {
    const { data: conn } = await admin.from("dm_connections")
      .select("id, requester_id, recipient_id, status").eq("id", b.id).single();
    if (!conn || conn.recipient_id !== user.id)
      return NextResponse.json({ error: "Not yours to answer" }, { status: 403 });
    const status = b.accept ? "accepted" : "declined";
    await admin.from("dm_connections")
      .update({ status, responded_at: new Date().toISOString() }).eq("id", b.id);
    if (b.accept) {
      const { data: me } = await admin.from("profiles").select("full_name").eq("id", user.id).single();
      await admin.from("notifications").insert({
        profile_id: conn.requester_id, title: "Connection accepted 🤝",
        body: `${me?.full_name ?? "They"} accepted — you can now message each other.`,
        link: "/portal/elite/messages"
      });
    }
    return NextResponse.json({ ok: true, status });
  }

  if (b.action === "message") {
    const { data: conn } = await admin.from("dm_connections")
      .select("id, requester_id, recipient_id, status").eq("id", b.connection_id).single();
    if (!conn || conn.status !== "accepted" ||
        (conn.requester_id !== user.id && conn.recipient_id !== user.id))
      return NextResponse.json({ error: "No accepted connection" }, { status: 403 });
    const body = String(b.body ?? "").trim().slice(0, 2000);
    if (!body) return NextResponse.json({ error: "Empty message" }, { status: 400 });
    const { error } = await admin.from("dm_messages")
      .insert({ connection_id: conn.id, sender_id: user.id, body });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
