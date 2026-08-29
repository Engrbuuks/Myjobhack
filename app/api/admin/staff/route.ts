import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/permissions.server";
import { can, PRESETS, CAPABILITIES, type Capability } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Create and manage staff accounts.
 *
 * POST   → invite a new user (or create one with a set password)
 * PATCH  → change role, permissions, or resend the invite
 * DELETE → remove an account
 *
 * Guard rails that exist because the failure mode is locking yourself out or
 * handing over more power than intended:
 *   · You cannot change your own role or permissions here.
 *   · You cannot grant a capability you do not hold yourself.
 *   · The last unrestricted admin cannot be demoted or deleted.
 * Every change is written to access_log.
 */

async function logAccess(admin: any, actor: string, target: string | null, action: string, detail: any) {
  await admin.from("access_log").insert({ actor_id: actor, target_id: target, action, detail });
}

/** Nobody can hand out access they don't have themselves. */
function filterGrantable(requested: Capability[] | null, granter: any): Capability[] | null {
  if (granter.permissions == null) return requested;    // unrestricted: may grant anything
  if (requested == null) return granter.permissions;    // can't grant "unrestricted"
  return requested.filter((c) => granter.permissions.includes(c));
}

export async function GET() {
  const gate = await requirePermission("users.view");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();

  const { data: users } = await admin.from("profiles")
    .select("id, full_name, email, role, permissions, created_at, invited_at, access_note")
    .in("role", ["admin", "recruiter", "trainer", "partner"])
    .order("created_at", { ascending: false });

  const { data: log } = await admin.from("access_log")
    .select("id, action, detail, created_at, actor_id, target_id")
    .order("created_at", { ascending: false }).limit(20);

  return NextResponse.json({
    staff: users ?? [],
    log: log ?? [],
    me: { id: gate.userId, permissions: gate.profile.permissions, role: gate.profile.role },
    presets: PRESETS,
    capabilities: CAPABILITIES
  });
}

export async function POST(request: Request) {
  const gate = await requirePermission("users.manage");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();

  const body = await request.json().catch(() => ({} as any));
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim();
  const role = String(body.role ?? "recruiter");
  const note = String(body.access_note ?? "").trim().slice(0, 200);
  const password = body.password ? String(body.password) : null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
  if (!fullName)
    return NextResponse.json({ error: "A full name is required — an account with no name is impossible to audit later." }, { status: 400 });
  if (!["job_seeker", "elite_member", "employer", "recruiter", "trainer", "partner", "admin"].includes(role))
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  if (password && password.length < 10)
    return NextResponse.json({ error: "A set password must be at least 10 characters." }, { status: 400 });

  // Resolve the permission list from a preset, or take an explicit list.
  let permissions: Capability[] | null = null;
  if (Array.isArray(body.permissions)) {
    permissions = body.permissions.filter((c: string) => c in CAPABILITIES);
  } else if (body.preset) {
    const preset = PRESETS.find((p) => p.id === body.preset);
    if (!preset) return NextResponse.json({ error: "Unknown access level." }, { status: 400 });
    permissions = preset.caps as Capability[] | null;
  }
  // Only staff roles carry capabilities at all.
  if (!["admin", "recruiter"].includes(role)) permissions = null;
  else permissions = filterGrantable(permissions, gate.profile);

  if (permissions === null && gate.profile.permissions !== null)
    return NextResponse.json({
      error: "You can't create someone with full access, because your own access is limited. Choose a specific access level."
    }, { status: 403 });

  // Already registered? Don't create a duplicate — adjust the existing one.
  const { data: existing } = await admin.from("profiles").select("id, email").eq("email", email).maybeSingle();
  if (existing)
    return NextResponse.json({
      error: `${email} already has an account. Change their role and access from the list below instead of creating a second one.`
    }, { status: 409 });

  let newUserId: string | null = null;
  let invited = false;

  if (password) {
    // Created ready to use — for someone you'll hand credentials to directly.
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (error) return NextResponse.json({ error: `Could not create the account: ${error.message}` }, { status: 400 });
    newUserId = data.user?.id ?? null;
  } else {
    // Invited: they set their own password, so no secret is ever in transit
    // through a chat message or an email you send by hand.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co"}/auth/callback`
    });
    if (error) return NextResponse.json({
      error: `Could not send the invitation: ${error.message}. If email is failing, create the account with a password instead.`
    }, { status: 400 });
    newUserId = data.user?.id ?? null;
    invited = true;
  }

  if (!newUserId)
    return NextResponse.json({ error: "The account was not created. Try again." }, { status: 500 });

  // The signup trigger creates the profile row; set the parts it can't know.
  const { error: pErr } = await admin.from("profiles").update({
    full_name: fullName, role, permissions, access_note: note || null,
    invited_by: gate.userId, invited_at: new Date().toISOString()
  }).eq("id", newUserId);

  if (pErr) return NextResponse.json({
    error: `The account was created but its access could not be set: ${pErr.message}. Fix it from the list below.`
  }, { status: 500 });

  await logAccess(admin, gate.userId, newUserId, "created",
    { email, role, permissions, invited, by: gate.profile.full_name });

  return NextResponse.json({
    ok: true,
    message: invited
      ? `Invitation sent to ${email}. They set their own password from the email — nothing to pass on by hand.`
      : `Account created for ${email}. Give them the password you set, and ask them to change it after signing in.`,
    user_id: newUserId
  });
}

export async function PATCH(request: Request) {
  const gate = await requirePermission("users.manage");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();

  const body = await request.json().catch(() => ({} as any));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Editing your own access is how people lock themselves out, or quietly
  // promote themselves. Neither should be possible from here.
  if (id === gate.userId)
    return NextResponse.json({
      error: "You can't change your own role or access. Ask another administrator."
    }, { status: 400 });

  const { data: target } = await admin.from("profiles")
    .select("id, role, permissions, full_name, email").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "That account no longer exists." }, { status: 404 });

  const patch: any = {};

  if (body.role) {
    if (!["job_seeker", "elite_member", "employer", "recruiter", "trainer", "partner", "admin"].includes(body.role))
      return NextResponse.json({ error: "Unknown role." }, { status: 400 });
    // Never leave the platform with no unrestricted administrator.
    if (target.role === "admin" && target.permissions === null && body.role !== "admin") {
      const { count } = await admin.from("profiles")
        .select("id", { count: "exact", head: true }).eq("role", "admin").is("permissions", null);
      if ((count ?? 0) <= 1)
        return NextResponse.json({
          error: "This is the only account with full access. Give someone else full access first, or you will lock everyone out."
        }, { status: 400 });
    }
    patch.role = body.role;
  }

  if (body.preset !== undefined || body.permissions !== undefined) {
    let perms: Capability[] | null = null;
    if (Array.isArray(body.permissions)) perms = body.permissions.filter((c: string) => c in CAPABILITIES);
    else if (body.preset) {
      const preset = PRESETS.find((p) => p.id === body.preset);
      if (!preset) return NextResponse.json({ error: "Unknown access level." }, { status: 400 });
      perms = preset.caps as Capability[] | null;
    }
    const role = patch.role ?? target.role;
    if (!["admin", "recruiter"].includes(role)) perms = null;
    else {
      if (perms === null && gate.profile.permissions !== null)
        return NextResponse.json({
          error: "You can't grant full access, because your own access is limited."
        }, { status: 403 });
      perms = filterGrantable(perms, gate.profile);
    }

    // Same protection when access is narrowed rather than the role changed.
    if (target.role === "admin" && target.permissions === null && perms !== null) {
      const { count } = await admin.from("profiles")
        .select("id", { count: "exact", head: true }).eq("role", "admin").is("permissions", null);
      if ((count ?? 0) <= 1)
        return NextResponse.json({
          error: "This is the only account with full access. Give someone else full access before restricting this one."
        }, { status: 400 });
    }
    patch.permissions = perms;
  }

  if (typeof body.access_note === "string") patch.access_note = body.access_note.trim().slice(0, 200) || null;

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await admin.from("profiles").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAccess(admin, gate.userId, id,
    patch.role ? "role_changed" : "permissions_changed",
    { from: { role: target.role, permissions: target.permissions }, to: patch, who: target.email });

  return NextResponse.json({ ok: true, message: `Updated ${target.full_name || target.email}.` });
}

export async function DELETE(request: Request) {
  const gate = await requirePermission("users.manage");
  if (!gate.ok) return gate.response;
  const admin = createAdminClient();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === gate.userId)
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });

  const { data: target } = await admin.from("profiles")
    .select("role, permissions, email, full_name").eq("id", id).maybeSingle();
  if (!target) return NextResponse.json({ error: "That account no longer exists." }, { status: 404 });

  if (target.role === "admin" && target.permissions === null) {
    const { count } = await admin.from("profiles")
      .select("id", { count: "exact", head: true }).eq("role", "admin").is("permissions", null);
    if ((count ?? 0) <= 1)
      return NextResponse.json({
        error: "This is the only account with full access. Deleting it would lock everyone out."
      }, { status: 400 });
  }

  await logAccess(admin, gate.userId, null, "deleted",
    { email: target.email, name: target.full_name, role: target.role });

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, message: `Removed ${target.full_name || target.email}.` });
}
