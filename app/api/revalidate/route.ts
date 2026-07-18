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
  revalidatePath("/sitemap.xml");
  return NextResponse.json({ ok: true });
}
