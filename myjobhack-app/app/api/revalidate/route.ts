import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Called after any staff/employer edit so public pages refresh immediately. */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { job_id, training_id } = await request.json().catch(() => ({}));

  revalidatePath("/roles");
  revalidatePath("/join");
  revalidatePath("/api/public/jobs");
  revalidatePath("/api/public/trainings");
  if (job_id) revalidatePath(`/jobs/${job_id}`);

  if (training_id) {
    revalidatePath("/trainings");
    revalidatePath("/api/public/trainings");
    revalidatePath(`/trainings/${training_id}`);
  }
  revalidatePath("/trainings");
  revalidatePath("/sitemap.xml");

  // Tell the WordPress site to drop its cached copy, so the website updates
  // the moment a role is published rather than on its own schedule.
  const wpUrl = process.env.WP_SITE_URL;
  const wpSecret = process.env.WP_FLUSH_SECRET;
  if (wpUrl && wpSecret) {
    try {
      await fetch(`${wpUrl.replace(/\/$/, "")}/wp-json/mjh/v1/flush`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: wpSecret }),
        signal: AbortSignal.timeout(6000)
      });
    } catch { /* the site still refreshes on its own within a minute */ }
  }
  return NextResponse.json({ ok: true });
}
