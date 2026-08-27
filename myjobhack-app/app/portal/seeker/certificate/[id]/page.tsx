import { createClient } from "@/lib/supabase/server";

export default async function CertificatePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: cert } = await supabase.from("certificates").select("*").eq("id", params.id).single();
  if (!cert || cert.talent_id !== user!.id) {
    return <div className="p-10 text-sm text-muted">Certificate not found.</div>;
  }
  const [{ data: profile }, { data: course }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", cert.talent_id).single(),
    cert.course_id
      ? supabase.from("courses").select("title").eq("id", cert.course_id).single()
      : Promise.resolve({ data: null as any })
  ]);

  return (
    <div className="max-w-3xl">
      <div className="rounded-card bg-ink text-white p-12 relative overflow-hidden border-4 border-coral/60 print:border-2">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-coral/15 blur-3xl" />
        <div className="text-xl font-bold mb-1">myjob<span className="text-coral">hack</span></div>
        <div className="text-[10px] font-extrabold uppercase tracking-[.3em] text-[#FFB4AC] mb-10">
          Certificate of completion
        </div>
        <div className="text-sm text-white/50 mb-2">This certifies that</div>
        <div className="font-display font-semibold text-4xl mb-6">{profile?.full_name}</div>
        <div className="text-sm text-white/50 mb-2">has successfully completed</div>
        <div className="font-display font-semibold text-2xl text-coral mb-10">
          {course?.title ?? "MYJOBHACK Training"}
        </div>
        <div className="flex items-end justify-between text-xs text-white/50">
          <div>
            <div className="tracking-wider text-white">{cert.serial}</div>
            <div className="mt-1">Verify at myjobhack.co</div>
          </div>
          <div className="text-right">
            <div className="text-white">{new Date(cert.issued_at).toLocaleDateString("en-GB", { dateStyle: "long" })}</div>
            <div className="mt-1">MYJOBHACK Academy</div>
          </div>
        </div>
      </div>
      <div className="mt-5 print:hidden">
        <a href="/portal/seeker/trainings" className="btn-ghost mr-3">← Back</a>
        <button className="btn-coral" onClick={undefined} id="printbtn">Print / save as PDF</button>
        <script dangerouslySetInnerHTML={{ __html: `document.getElementById('printbtn').onclick=()=>window.print()` }} />
      </div>
    </div>
  );
}
