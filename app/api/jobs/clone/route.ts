import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Duplicate a job as a fresh draft — everything copied except identity and dates. */
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { job_id } = await request.json();
  if (!job_id) return NextResponse.json({ error: "No job specified" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role, id").eq("id", user.id).single();
  const staff = ["admin", "recruiter"].includes(profile?.role ?? "");

  const { data: job } = await admin.from("jobs").select("*").eq("id", job_id).single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // employers may only clone their own organisation's roles
  if (!staff) {
    const { data: membership } = await admin.from("org_members")
      .select("org_id").eq("profile_id", user.id).eq("org_id", job.org_id).maybeSingle();
    if (!membership) return NextResponse.json({ error: "Not your role to copy" }, { status: 403 });
  }

  const {
    id, created_at, updated_at, published_at, closes_at,
    is_featured, featured_rank, form_id, ...rest
  } = job as Record<string, any>;

  const { data: copy, error } = await admin.from("jobs").insert({
    ...rest,
    title: `${job.title} (copy)`,
    status: "draft",
    published_at: null,
    closes_at: null,
    is_featured: false,
    featured_rank: null,
    posted_by: user.id
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // carry the application form across, so screening questions come too
  if (form_id) {
    const { data: form } = await admin.from("forms").select("title, description").eq("id", form_id).maybeSingle();
    if (form) {
      const { data: newForm } = await admin.from("forms")
        .insert({ title: form.title, description: form.description, created_by: user.id })
        .select("id").single();
      if (newForm) {
        const { data: fields } = await admin.from("form_fields").select("*").eq("form_id", form_id).order("position");
        if (fields?.length) {
          await admin.from("form_fields").insert(
            fields.map(({ id: _fid, form_id: _f, created_at: _c, ...f }) => ({ ...f, form_id: newForm.id }))
          );
        }
        await admin.from("jobs").update({ form_id: newForm.id }).eq("id", copy.id);
      }
    }
  }

  return NextResponse.json({ ok: true, id: copy.id });
}
