import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Read the saved interview defaults — used to pre-fill the scheduler. */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "interviews").maybeSingle();
  const v = (data?.value ?? {}) as any;
  return NextResponse.json({
    booking_url: v.booking_url ?? "",
    default_mode: v.default_mode ?? "video",
    default_duration_min: Number(v.default_duration_min) || 30,
    default_meeting_link: v.default_meeting_link ?? ""
  });
}

/** Save them. Admins only — this affects every interview invite. */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const body = await request.json();
  const url = String(body.booking_url ?? "").trim();
  const link = String(body.default_meeting_link ?? "").trim();

  // Fail loudly on a malformed link rather than emailing candidates a dead one.
  for (const [label, v] of [["Booking link", url], ["Meeting link", link]]) {
    if (v && !/^https?:\/\/\S+$/i.test(v))
      return NextResponse.json({ error: `${label} must be a full URL starting with https://` }, { status: 400 });
  }

  const { data: existing } = await admin.from("app_settings").select("value").eq("key", "interviews").maybeSingle();
  const merged = {
    ...(existing?.value ?? {}),
    booking_url: url,
    default_mode: body.default_mode ?? "video",
    default_duration_min: Number(body.default_duration_min) || 30,
    default_meeting_link: link
  };

  const { error } = await admin.from("app_settings")
    .upsert({ key: "interviews", value: merged }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 });

  // Verify it persisted — a policy can silently reject a write.
  const { data: after } = await admin.from("app_settings").select("value").eq("key", "interviews").maybeSingle();
  if ((after?.value as any)?.booking_url !== url)
    return NextResponse.json({ error: "The save was accepted but did not persist." }, { status: 409 });

  return NextResponse.json({ ok: true, saved: merged });
}
