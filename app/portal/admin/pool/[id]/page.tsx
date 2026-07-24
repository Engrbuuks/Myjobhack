import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";

export default async function TalentDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: profile }, { data: talent }, { data: expertise }, { data: taxonomies }, { data: creds }, { data: enrolls }, { data: certs }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", params.id).single(),
      supabase.from("talent_profiles").select("*").eq("profile_id", params.id).single(),
      supabase.from("talent_expertise").select("taxonomy_id").eq("talent_id", params.id),
      supabase.from("taxonomies").select("id, label"),
      supabase.from("credentials").select("*").eq("talent_id", params.id).order("created_at", { ascending: false }),
      supabase.from("enrollments").select("training_id, status, completed_at").eq("talent_id", params.id),
      supabase.from("certificates").select("serial, issued_at, course_id").eq("talent_id", params.id)
    ]);
  const trainingIds = (enrolls ?? []).map((e) => e.training_id);
  const { data: trainings } = trainingIds.length
    ? await supabase.from("trainings").select("id, title").in("id", trainingIds)
    : { data: [] as any[] };
  const trMap = new Map((trainings ?? []).map((t) => [t.id, t.title]));

  const tmap = new Map((taxonomies ?? []).map((t) => [t.id, t.label]));
  let resumeUrl: string | null = null;
  let resumeMeta = "";
  if (talent?.resume_document_id) {
    const { data: doc } = await supabase
      .from("documents").select("bucket, path, original_name, size_bytes, original_size_bytes, storage_provider")
      .eq("id", talent.resume_document_id).single();
    if (doc) {
      const { locationFromDocument, signedUrlFor } = await import("@/lib/storage");
      const { url: signedUrl } = await signedUrlFor({
        supabase, location: locationFromDocument(doc as any), expiresIn: 3600
      });
      const signed = signedUrl ? { signedUrl } : null;
      resumeUrl = signed?.signedUrl ?? null;
      const kb = (n: number | null) => (n ? `${Math.round(n / 1024)}KB` : "?");
      resumeMeta = `${doc.original_name} · ${kb(doc.size_bytes)}${doc.original_size_bytes && doc.original_size_bytes > (doc.size_bytes ?? 0) ? ` (was ${kb(doc.original_size_bytes)})` : ""}`;
    }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-4 py-2.5 border-b border-line last:border-0 text-sm">
      <span className="w-40 shrink-0 text-muted">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );

  return (
    <>
      <PageHeader
        title={profile?.full_name || "Talent"}
        sub={talent?.headline ?? undefined}
        action={<Link href="/portal/admin/pool" className="btn-ghost">← Back to pool</Link>}
      />

      <div className="grid lg:grid-cols-2 gap-5 max-w-4xl">
        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Contact & basics</div>
          {row("Email", profile?.email)}
          {row("Phone", profile?.phone)}
          {row("Location", [profile?.city, profile?.country].filter(Boolean).join(", ") || "—")}
          {row("Experience", `${talent?.years_experience ?? 0} years`)}
          {row("Completion", `${talent?.profile_completion ?? 0}%`)}
          {row("Verification", <span className="capitalize">{talent?.verification}</span>)}
        </div>

        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">The four axes</div>
          {row("Niche", talent?.niche_id ? tmap.get(talent.niche_id) : "—")}
          {row("Career goal", talent?.career_goal_id ? tmap.get(talent.career_goal_id) : "—")}
          {row("Expertise", (expertise ?? []).map((e) => tmap.get(e.taxonomy_id)).filter(Boolean).join(", ") || "—")}
          {row("Expectation", talent?.salary_min
            ? `${talent.salary_currency} ${Number(talent.salary_min).toLocaleString()}–${Number(talent.salary_max ?? talent.salary_min).toLocaleString()} · ${talent.expected_role_level ?? "?"} · ${talent.preferred_work_mode ?? "?"} · reloc: ${talent.relocation}`
            : "—")}
        </div>

        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Resume</div>
          {resumeUrl ? (
            <a href={resumeUrl} target="_blank" rel="noopener"
              className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:border-coral transition">
              <span className="text-sm font-medium">{resumeMeta}</span>
              <span className="text-coral font-semibold text-sm">Open →</span>
            </a>
          ) : (
            <p className="text-sm text-muted-2">No resume uploaded yet.</p>
          )}
        </div>

        <div className="card p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Credentials</div>
          {(creds ?? []).length === 0 ? (
            <p className="text-sm text-muted-2">None submitted yet. Verification tooling lands in a later layer.</p>
          ) : (
            <div className="space-y-2">
              {(creds ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm border border-line rounded-xl px-4 py-3">
                  <span>{c.title} · {c.institution} {c.year ? `(${c.year})` : ""}</span>
                  <span className={`capitalize text-xs font-bold px-2 py-1 rounded-pill ${
                    c.status === "verified" ? "bg-ink text-white" : "bg-coral-soft text-coral"
                  }`}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-6 lg:col-span-2 border-coral/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-coral mb-1">Danger zone</div>
              <p className="text-sm text-muted">Permanently delete this account and all its data — applications, enrollments, certificates, credentials. Meant for test accounts and legitimate removal requests.</p>
            </div>
            <DeleteButton action="delete_user" id={params.id} label="Delete account" confirmLabel="Permanently delete" redirect="/portal/admin/pool" />
          </div>
        </div>
        <div className="card p-6 lg:col-span-2">
          <div className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Learning record — feeds matching</div>
          {(enrolls ?? []).length === 0 ? (
            <p className="text-sm text-muted-2">No trainings yet. Segment them into one from the invite engine.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {(enrolls ?? []).map((e, i) => (
                <div key={i} className="flex items-center justify-between text-sm border border-line rounded-xl px-4 py-3">
                  <span>{trMap.get(e.training_id) ?? "Training"}</span>
                  <span className={`capitalize text-xs font-bold px-2 py-1 rounded-pill ${
                    e.status === "completed" ? "bg-ink text-white" : "bg-coral-soft text-coral"
                  }`}>{e.status}</span>
                </div>
              ))}
            </div>
          )}
          {(certs ?? []).length > 0 && (
            <div className="mt-3 text-xs text-muted">
              Certificates: {(certs ?? []).map((c) => c.serial).join(" · ")}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
