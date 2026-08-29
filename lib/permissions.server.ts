import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, CAPABILITIES, type Capability } from "@/lib/permissions";

/**
 * Server-only half of the permission system.
 *
 * Kept apart from lib/permissions.ts because that file is imported by client
 * components, and anything reaching `next/headers` from a client bundle fails
 * the build outright.
 */
/**
 * Server-side gate. Returns the caller's profile when permitted, or an error
 * response to return directly.
 *
 * Every route that changes data should start with this. A capability enforced
 * only by hiding a button is not enforced at all — the request can still be
 * made by hand.
 */
export async function requirePermission(cap: Capability): Promise<
  { ok: true; profile: any; userId: string } | { ok: false; response: Response }
> {
    const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return { ok: false, response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles")
    .select("id, role, full_name, email, permissions").eq("id", user.id).single();

  if (!can(profile, cap))
    return {
      ok: false,
      response: NextResponse.json({
        error: `You don't have permission to do that (${CAPABILITIES[cap]}). Ask an administrator if you need it.`
      }, { status: 403 })
    };

  return { ok: true, profile, userId: user.id };
}

