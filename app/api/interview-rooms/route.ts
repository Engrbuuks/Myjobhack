import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoomSettings, saveRoomSettings, jitsiConfig, jitsiActive, visibleMeetLinks } from "@/lib/interviewRooms";
import { normaliseMeetUrl } from "@/lib/interviewRoomKind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Video room options for whoever is scheduling interviews.
 *
 * GET   what this person can choose: our own room if it is on, the Google
 *       Meet links they may use, and the default.
 * POST  { action: "save_meet", url }        save your own Meet link
 *       { action: "clear_meet" }            remove it
 *       { action: "settings", default_kind, jitsi_enabled }   admins only
 *       { action: "check_server" }          admins only; is the Jitsi server up
 *
 * Open to the same people who can schedule an interview: staff, and members
 * of an employer organisation. The Jitsi secret never leaves the server.
 */
async function caller() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("id, role, full_name").eq("id", user.id).maybeSingle();
  const isStaff = ["admin", "recruiter"].includes(me?.role ?? "");
  let isOrg = false;
  if (!isStaff) {
    const { data: m } = await admin.from("org_members").select("org_id").eq("profile_id", user.id).limit(1).maybeSingle();
    isOrg = !!m;
  }
  return { admin, user, me, isStaff, isAdmin: me?.role === "admin", allowed: isStaff || isOrg };
}

export async function GET() {
  const c = await caller();
  if (!c) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!c.allowed) return NextResponse.json({ error: "These are the hiring team's interview settings." }, { status: 403 });

  const settings = await getRoomSettings(c.admin);
  const cfg = jitsiConfig();
  const active = jitsiActive(settings);
  return NextResponse.json({
    default_kind: settings.default_kind === "jitsi" && !active ? "manual" : settings.default_kind,
    jitsi: {
      active,
      // The setup state is for admins; everyone else only needs "on or off".
      ...(c.isAdmin ? { configured: cfg.configured, enabled: settings.jitsi_enabled, missing: cfg.missing, domain: cfg.domain } : {})
    },
    meet_links: await visibleMeetLinks(c.admin, c.user.id, c.isStaff, settings),
    my_meet: settings.meet_links[c.user.id]?.url ?? null,
    me: c.user.id
  });
}

export async function POST(request: Request) {
  const c = await caller();
  if (!c) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!c.allowed) return NextResponse.json({ error: "These are the hiring team's interview settings." }, { status: 403 });
  const b = await request.json().catch(() => ({} as any));
  const settings = await getRoomSettings(c.admin);

  if (b.action === "save_meet" || b.action === "clear_meet") {
    const links = { ...settings.meet_links };
    if (b.action === "clear_meet") delete links[c.user.id];
    else {
      // Only a real Meet room address is accepted, so this field can never be
      // used to put some other link into candidates' invitations.
      const url = normaliseMeetUrl(String(b.url ?? ""));
      if (!url)
        return NextResponse.json({
          error: "That is not a Google Meet link. It should look like https://meet.google.com/abc-defg-hij"
        }, { status: 400 });
      links[c.user.id] = { url, name: c.me?.full_name ?? "", saved_at: new Date().toISOString() };
    }
    await saveRoomSettings(c.admin, { meet_links: links });
    return NextResponse.json({ ok: true, my_meet: links[c.user.id]?.url ?? null });
  }

  if (!c.isAdmin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  if (b.action === "settings") {
    const patch: any = {};
    if (["jitsi", "meet", "manual"].includes(b.default_kind)) patch.default_kind = b.default_kind;
    if (typeof b.jitsi_enabled === "boolean") {
      if (b.jitsi_enabled && !jitsiConfig().configured)
        return NextResponse.json({
          error: `The Jitsi server is not set up in Vercel yet. Missing: ${jitsiConfig().missing.join(", ")}.`
        }, { status: 400 });
      patch.jitsi_enabled = b.jitsi_enabled;
    }
    if (patch.default_kind === "jitsi" && !(patch.jitsi_enabled ?? settings.jitsi_enabled))
      return NextResponse.json({ error: "Switch our own room on before making it the default." }, { status: 400 });
    const saved = await saveRoomSettings(c.admin, patch);
    await c.admin.from("activity_log").insert({
      actor_id: c.user.id, action: "Interview room settings changed", entity: "settings", entity_id: null,
      meta: { default_kind: saved.default_kind, jitsi_enabled: saved.jitsi_enabled }
    });
    return NextResponse.json({ ok: true, default_kind: saved.default_kind, jitsi_enabled: saved.jitsi_enabled });
  }

  if (b.action === "check_server") {
    const cfg = jitsiConfig();
    if (!cfg.domain) return NextResponse.json({ ok: false, error: "JITSI_DOMAIN is not set in Vercel." }, { status: 400 });
    try {
      const res = await fetch(`https://${cfg.domain}/config.js`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      const text = res.ok ? await res.text() : "";
      // A Jitsi server answers with its own config file. Anything else at that
      // address is not the server, whatever the status code says.
      const isJitsi = /hosts\s*[:=]/.test(text) || /config\s*=/.test(text);
      return NextResponse.json({
        ok: res.ok && isJitsi, status: res.status,
        message: res.ok && isJitsi
          ? `${cfg.domain} is up and answering as a Jitsi server.`
          : res.ok ? `${cfg.domain} answered, but not as a Jitsi server. Check the address.`
          : `${cfg.domain} answered with an error (${res.status}).`
      });
    } catch (e: any) {
      return NextResponse.json({
        ok: false, message: `${cfg.domain} could not be reached: ${e?.name === "TimeoutError" ? "no answer in 8 seconds" : e?.message ?? "failed"}.`
      });
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
