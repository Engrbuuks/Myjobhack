import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { AcceptInviteButton } from "@/components/EnrollActions";

export default async function SeekerTrainings() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: invites }, { data: enrolls }, { data: certs }] = await Promise.all([
    supabase.from("training_invites").select("training_id, sent_at").eq("talent_id", user!.id),
    supabase.from("enrollments").select("id, training_id, status").eq("talent_id", user!.id),
    supabase.from("certificates").select("id, serial, issued_at, course_id").eq("talent_id", user!.id)
  ]);

  const enrolledIds = new Set((enrolls ?? []).map((e) => e.training_id));
  const pendingInvites = (invites ?? []).filter((i) => !enrolledIds.has(i.training_id));

  const allTrainingIds = Array.from(new Set([
    ...pendingInvites.map((i) => i.training_id),
    ...(enrolls ?? []).map((e) => e.training_id)
  ]));
  const { data: trainings } = allTrainingIds.length
    ? await supabase.from("trainings")
        .select("id, title, description, delivery, status, starts_at, location_or_link, course_id")
        .in("id", allTrainingIds)
    : { data: [] as any[] };
  const tmap = new Map((trainings ?? []).map((t) => [t.id, t]));

  const courseIds = Array.from(new Set([
    ...(trainings ?? []).map((t) => t.course_id).filter(Boolean),
    ...(certs ?? []).map((c) => c.course_id).filter(Boolean)
  ])) as string[];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id, title").in("id", courseIds)
    : { data: [] as any[] };
  const cmap = new Map((courses ?? []).map((c) => [c.id, c.title]));

  const myEnrollments = (enrolls ?? [])
    .map((e) => ({ ...e, t: tmap.get(e.training_id) }))
    .filter((e) => e.t);

  return (
    <>
      <PageHeader title="Trainings"
        sub="Invitations selected for your skills, your registered sessions, and your certificates." />

      {pendingInvites.length > 0 && (
        <div className="mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">You&rsquo;re invited ✦</div>
          <div className="space-y-3">
            {pendingInvites.map((i) => {
              const t = tmap.get(i.training_id);
              if (!t) return null;
              return (
                <div key={i.training_id} className="card p-6 border-coral/40">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-60">
                      <div className="font-display font-semibold text-lg">{t.title}</div>
                      <div className="text-sm text-muted mt-1">{t.description}</div>
                      <div className="text-xs text-muted-2 mt-2">
                        {t.delivery === "lms" ? "Self-paced LMS course" : "Live session"} ·{" "}
                        {t.starts_at ? new Date(t.starts_at).toLocaleString() : "date TBA"}
                      </div>
                    </div>
                    <AcceptInviteButton trainingId={t.id} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-8">
        <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">My trainings</div>
        {myEnrollments.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">
            Nothing yet. When a training fits your skills, the invite lands here — keep your profile sharp.
          </div>
        ) : (
          <div className="space-y-3">
            {myEnrollments.map((e) => (
              <div key={e.id} className="card p-5 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-60">
                  <div className="font-semibold text-sm">{e.t!.title}</div>
                  <div className="text-xs text-muted-2 mt-0.5">
                    {e.t!.delivery === "lms" ? "LMS course" : "Live session"} ·{" "}
                    {e.t!.starts_at ? new Date(e.t!.starts_at).toLocaleString() : "date TBA"} · {e.status}
                  </div>
                </div>
                {e.t!.delivery === "external" && e.t!.location_or_link && ["registered", "attended"].includes(e.status) && (
                  <a href={e.t!.location_or_link.startsWith("http") ? e.t!.location_or_link : "#"}
                    target="_blank" rel="noopener" className="btn-ghost !h-10">
                    {e.t!.location_or_link.startsWith("http") ? "Join session →" : e.t!.location_or_link}
                  </a>
                )}
                {e.t!.delivery === "lms" && e.t!.course_id && (
                  <Link href={`/portal/seeker/learn/${e.t!.course_id}`} className="btn-coral !h-10">
                    {e.status === "completed" ? "Review course" : "Continue learning →"}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(certs ?? []).length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Certificates</div>
          <div className="grid sm:grid-cols-2 gap-4">
            {(certs ?? []).map((c) => (
              <Link key={c.id} href={`/portal/seeker/certificate/${c.id}`}
                className="card p-5 bg-ink text-white border-ink hover:border-coral transition">
                <div className="text-[10px] font-bold uppercase tracking-[.24em] text-[#FFB4AC] mb-2">Certificate</div>
                <div className="font-display font-semibold">{c.course_id ? cmap.get(c.course_id) : "Training"}</div>
                <div className="text-xs text-white/50 mt-1">{c.serial} · {new Date(c.issued_at).toLocaleDateString()}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
