import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

/** Called after any staff/employer edit so public pages refresh immediately. */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { job_id, training_id } = await request.json().catch(() => ({}));

  /**
   * Being signed in was enough to make the server rebuild every public page
   * and poke WordPress to drop its cache, as fast as the requests could be
   * sent. The callers are the job editor and the training editor, so the
   * check is the right to have edited the thing that changed: staff by
   * capability, an employer by owning the job, a trainer by running the
   * training.
   */
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles")
    .select("id, role, permissions").eq("id", user.id).maybeSingle();

  let allowed = can(me, "jobs.manage") || can(me, "trainings.manage");

  if (!allowed && job_id) {
    const { data: job } = await admin.from("jobs").select("org_id").eq("id", job_id).maybeSingle();
    if (job?.org_id) {
      const { data: membership } = await admin.from("org_members")
        .select("org_id").eq("org_id", job.org_id).eq("profile_id", user.id).maybeSingle();
      allowed = !!membership;
    }
  }

  if (!allowed && training_id) {
    const { data: training } = await admin.from("trainings")
      .select("trainer_id").eq("id", training_id).maybeSingle();
    allowed = !!training && training.trainer_id === user.id;
  }

  if (!allowed)
    return NextResponse.json({
      error: "Refreshing the public pages is for whoever can edit the job or training that changed."
    }, { status: 403 });

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
