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

  /**
   * Carry the application form across, so screening questions come too.
   *
   * WHAT WENT WRONG: this queried a table called `forms`, which does not
   * exist. It is `application_forms` everywhere else in the codebase. The
   * columns were wrong too (`title` and `description`, where the table has
   * `name`) and so was the sort column (`position`, where it is `sort`). The
   * query returned null, `if (form)` was false, the whole block was skipped,
   * and the route still answered ok. So duplicating a role handed out a copy
   * with no screening questions at all, with nothing saying anything had been
   * dropped, while the button's own tooltip promised an editable copy of the
   * role.
   *
   * A failure here is now reported rather than swallowed, because a job
   * published without its eligibility rules lets through applicants the rules
   * existed to filter out.
   */
  let formWarning: string | null = null;
  if (form_id) {
    const { data: form, error: formErr } = await admin.from("application_forms")
      .select("name, is_template").eq("id", form_id).maybeSingle();
    if (formErr || !form) {
      formWarning = "The job was copied, but its application form could not be read, so the copy has no screening questions yet.";
    } else {
      const { data: newForm, error: newFormErr } = await admin.from("application_forms")
        .insert({ name: form.name, is_template: false, created_by: user.id })
        .select("id").single();
      if (newFormErr || !newForm) {
        formWarning = "The job was copied, but a new application form could not be created, so the copy has no screening questions yet.";
      } else {
        const { data: fields } = await admin.from("form_fields")
          .select("*").eq("form_id", form_id).order("sort");
        if (fields?.length) {
          const { error: fieldErr } = await admin.from("form_fields").insert(
            fields.map(({ id: _fid, form_id: _f, ...f }) => ({ ...f, form_id: newForm.id }))
          );
          if (fieldErr)
            formWarning = `The job was copied with an empty application form: the questions could not be copied (${fieldErr.message}).`;
        }
        await admin.from("jobs").update({ form_id: newForm.id }).eq("id", copy.id);
      }
    }
  }

  return NextResponse.json({
    ok: true, id: copy.id,
    ...(formWarning ? { warning: formWarning } : {})
  });
}
