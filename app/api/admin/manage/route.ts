import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function orgAuthority(admin: any, userId: string, orgId: string | null) {
  if (!orgId) return false;
  const { data: m } = await admin.from("org_members")
    .select("org_id").eq("org_id", orgId).eq("profile_id", userId).maybeSingle();
  return !!m;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isStaff = me?.role === "admin" || me?.role === "recruiter";
  const isAdmin = me?.role === "admin";

  const { action, id, data } = await request.json();
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });
  const admin = createAdminClient();
  const deny = () => NextResponse.json({ error: "Not authorized" }, { status: 403 });

  try {
    switch (action) {
      // ---------------- JOBS ----------------
      case "delete_job": {
        const { data: job } = await admin.from("jobs").select("id, org_id, title").eq("id", id).single();
        if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (!isStaff && !(await orgAuthority(admin, user.id, job.org_id))) return deny();
        await admin.from("interviews").delete().eq("job_id", id);
        await admin.from("applications").delete().eq("job_id", id);
        await admin.from("jobs").delete().eq("id", id);
        await admin.from("activity_log").insert({ actor_id: user.id, action: "Deleted job", entity: "job", entity_id: id, meta: { title: job.title } });
        return NextResponse.json({ ok: true });
      }

      // ---------------- TRAININGS ----------------
      case "delete_training": {
        if (!isStaff) return deny();
        await admin.from("training_invites").delete().eq("training_id", id);
        await admin.from("enrollments").delete().eq("training_id", id);
        await admin.from("trainings").delete().eq("id", id);
        return NextResponse.json({ ok: true });
      }

      // ---------------- COURSES ----------------
      case "delete_course": {
        if (!isStaff) return deny();
        const { count: certs } = await admin.from("certificates")
          .select("*", { count: "exact", head: true }).eq("course_id", id);
        if ((certs ?? 0) > 0)
          return NextResponse.json({ error: `This course has issued ${certs} certificate(s) — it can't be deleted. Set its status to draft to retire it instead.` }, { status: 400 });
        const { data: mods } = await admin.from("course_modules").select("id").eq("course_id", id);
        const modIds = (mods ?? []).map((m: any) => m.id);
        if (modIds.length) {
          const { data: lessons } = await admin.from("lessons").select("id").in("module_id", modIds);
          const lessonIds = (lessons ?? []).map((l: any) => l.id);
          if (lessonIds.length) await admin.from("lesson_progress").delete().in("lesson_id", lessonIds);
          await admin.from("lessons").delete().in("module_id", modIds);
          await admin.from("course_modules").delete().eq("course_id", id);
        }
        await admin.from("trainings").update({ course_id: null }).eq("course_id", id);
        await admin.from("courses").delete().eq("id", id);
        return NextResponse.json({ ok: true });
      }

      // ---------------- INTERVIEWS ----------------
      case "delete_interview": {
        const { data: iv } = await admin.from("interviews").select("id, org_id").eq("id", id).single();
        if (!iv) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (!isStaff && !(await orgAuthority(admin, user.id, iv.org_id))) return deny();
        await admin.from("interviews").delete().eq("id", id);
        return NextResponse.json({ ok: true });
      }

      // ---------------- FORMS ----------------
      case "delete_form": {
        const { data: form } = await admin.from("application_forms").select("id, created_by").eq("id", id).single();
        if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (!isStaff && form.created_by !== user.id) return deny();
        await admin.from("jobs").update({ form_id: null }).eq("form_id", id);
        await admin.from("form_fields").delete().eq("form_id", id);
        await admin.from("application_forms").delete().eq("id", id);
        return NextResponse.json({ ok: true });
      }

      // ---------------- TAXONOMIES ----------------
      case "rename_taxonomy": {
        if (!isAdmin) return deny();
        await admin.from("taxonomies").update({ label: data.label }).eq("id", id);
        return NextResponse.json({ ok: true });
      }
      case "delete_taxonomy": {
        if (!isAdmin) return deny();
        const { error } = await admin.from("taxonomies").delete().eq("id", id);
        if (error) {
          await admin.from("taxonomies").update({ active: false }).eq("id", id);
          return NextResponse.json({ ok: true, softened: true, note: "In use by existing profiles or jobs — deactivated instead of deleted." });
        }
        return NextResponse.json({ ok: true });
      }

      // ---------------- CHAPTERS ----------------
      case "create_chapter": {
        if (!isAdmin) return deny();
        const { error } = await admin.from("chapters").insert({ city: data.city, country: data.country, active: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }
      case "update_chapter": {
        if (!isAdmin) return deny();
        await admin.from("chapters").update(data).eq("id", id);
        return NextResponse.json({ ok: true });
      }
      case "delete_chapter": {
        if (!isAdmin) return deny();
        const { count } = await admin.from("elite_memberships")
          .select("*", { count: "exact", head: true }).eq("chapter_id", id);
        if ((count ?? 0) > 0)
          return NextResponse.json({ error: `${count} member(s) belong to this chapter — reassign them first, or deactivate the chapter.` }, { status: 400 });
        await admin.from("chapters").delete().eq("id", id);
        return NextResponse.json({ ok: true });
      }

      // ---------------- PLANS ----------------
      case "update_plan": {
        if (!isAdmin) return deny();
        await admin.from("plans").update({
          name: data.name, price_ngn: data.price_ngn, price_usd: data.price_usd,
          interval: data.interval, features: data.features, active: data.active
        }).eq("id", id);
        return NextResponse.json({ ok: true });
      }

      // ---------------- USERS (admin only — the nuclear option) ----------------
      case "delete_user": {
        if (!isAdmin) return deny();
        if (id === user.id) return NextResponse.json({ error: "You can't delete your own admin account from here." }, { status: 400 });
        const { data: target } = await admin.from("profiles").select("email, role").eq("id", id).single();
        if (target?.role === "admin")
          return NextResponse.json({ error: "Admin accounts can't be deleted from the UI." }, { status: 400 });
        // wipe rows without FK-cascade from auth
        await admin.from("interviews").delete().eq("talent_id", id);
        await admin.from("applications").delete().eq("talent_id", id);
        await admin.from("training_invites").delete().eq("talent_id", id);
        await admin.from("enrollments").delete().eq("talent_id", id);
        await admin.from("certificates").delete().eq("talent_id", id);
        await admin.from("elite_memberships").delete().eq("talent_id", id);
        await admin.from("credentials").delete().eq("talent_id", id);
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        await admin.from("activity_log").insert({ actor_id: user.id, action: "Deleted user account", entity: "profile", entity_id: id, meta: { email: target?.email } });
        return NextResponse.json({ ok: true });
      }

      case "set_role": {
        if (!isAdmin) return deny();
        if (id === user.id) return NextResponse.json({ error: "Change your own role in SQL, not here — this prevents locking yourself out." }, { status: 400 });
        const ROLES = ["job_seeker", "elite_member", "employer", "recruiter", "trainer", "partner", "admin"];
        if (!ROLES.includes(data?.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        await admin.from("profiles").update({ role: data.role }).eq("id", id);
        await admin.from("activity_log").insert({ actor_id: user.id, action: `Role changed to ${data.role}`, entity: "profile", entity_id: id });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Failed" }, { status: 500 });
  }
}
