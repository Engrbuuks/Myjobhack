import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Saves pricing. Every write is error-checked and then VERIFIED by reading the
 * value back — a database policy can reject a write silently, and returning
 * ok:true when nothing changed is worse than failing loudly.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Fail loudly if the service-role key is missing — without it every write
  // below is silently blocked by row-level security.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      error: "Server is missing SUPABASE_SERVICE_ROLE_KEY, so pricing cannot be saved. Set it in your hosting environment."
    }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { kind, id, data } = await request.json();

  try {
    if (kind === "seeker_plan" || kind === "employer_plan" || kind === "training") {
      const table = kind === "seeker_plan" ? "plans" : kind === "employer_plan" ? "employer_plans" : "trainings";
      if (!id) return NextResponse.json({ error: "Missing record id" }, { status: 400 });

      const { error, data: updated } = await admin.from(table).update(data).eq("id", id).select().single();
      if (error) return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 });
      if (!updated) return NextResponse.json({ error: "Nothing was saved — the record was not found or the write was rejected." }, { status: 409 });

      // Verify at least one field actually took the new value.
      const key = Object.keys(data)[0];
      if (key && String((updated as any)[key]) !== String(data[key])) {
        return NextResponse.json({ error: "The database accepted the request but did not store the change." }, { status: 409 });
      }
      return NextResponse.json({ ok: true, saved: updated });
    }

    if (kind === "loose") {
      const { data: existing } = await admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle();
      const merged = { ...(existing?.value ?? {}), ...data };

      const { error } = await admin.from("app_settings")
        .upsert({ key: "pricing", value: merged }, { onConflict: "key" });
      if (error) return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 });

      // Read it back and confirm every submitted field persisted.
      const { data: after } = await admin.from("app_settings").select("value").eq("key", "pricing").maybeSingle();
      const stored = (after?.value ?? {}) as Record<string, any>;
      const missing = Object.keys(data).filter(k => String(stored[k]) !== String(data[k]));
      if (missing.length) {
        return NextResponse.json({
          error: `Saved request succeeded but these values did not persist: ${missing.join(", ")}. This usually means a database policy blocked the write.`
        }, { status: 409 });
      }
      return NextResponse.json({ ok: true, saved: stored });
    }

    return NextResponse.json({ error: "Unknown pricing kind" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error saving pricing." }, { status: 500 });
  }
}
