import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRoomRef, roomWindow } from "@/lib/interviewRooms";

export const dynamic = "force-dynamic";

/**
 * Where a candidate's interview link lands.
 *
 * The link carries the interview id and a signature, so it cannot be altered
 * to reach someone else's interview. This page says plainly whether the room
 * is open, and when it will be, because "it did not work" five minutes early
 * is the most common way a candidate ends up thinking the interview is off.
 *
 * Joining goes through /api/public/interview-room, which checks everything
 * again and only then hands out the pass. Nothing here reveals more than the
 * candidate's own name, role and time.
 */
export default async function InterviewRoomPage({ params }: { params: { ref: string } }) {
  const id = verifyRoomRef(params.ref);
  if (!id) return <Shell title="This link is not valid" text="Check you used the full link from your invitation email, or reply to that email and we will send it again." />;

  const admin = createAdminClient();
  const { data: iv } = await admin.from("interviews")
    .select("id, status, scheduled_at, duration_min, timezone, guest_name, talent_id, job_id")
    .eq("id", id).maybeSingle();
  if (!iv) return <Shell title="This interview no longer exists" text="Reply to your invitation email and we will help." />;

  if (iv.status === "cancelled")
    return <Shell title="This interview was cancelled" text="Please check your email for details. Your application has not been closed because of this." />;

  const { data: job } = await admin.from("jobs").select("title").eq("id", iv.job_id).maybeSingle();
  const { data: prof } = iv.talent_id
    ? await admin.from("profiles").select("full_name").eq("id", iv.talent_id).maybeSingle()
    : { data: null as any };
  const first = String(prof?.full_name ?? iv.guest_name ?? "").split(" ")[0];

  const w = roomWindow(iv);
  if (!w) return <Shell title="Your interview time is not set yet" text="Once a time is confirmed, this same link will open shortly before it." />;

  const tz = iv.timezone || "Africa/Lagos";
  const fmt = (ms: number) => new Date(ms).toLocaleString("en-GB", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false
  });
  const now = Date.now();

  if (now > w.closes)
    return <Shell title="This interview has ended" text="If you missed it, reply to your invitation email to ask about another time." />;

  const intro = `${first ? `${first}, your` : "Your"} interview${job?.title ? ` for ${job.title}` : ""} is on ${fmt(w.start)}.`;

  if (now < w.opens)
    return (
      <Shell title="Your interview room is not open yet" text={intro}>
        <p className="text-sm text-muted mt-3">
          It opens at <strong className="text-ink">{fmt(w.opens)}</strong>, 15 minutes before your time.
          Come back to this same link then.
        </p>
        <Tips />
      </Shell>
    );

  return (
    <Shell title="Your interview room is open" text={intro}>
      <a href={`/api/public/interview-room?ref=${encodeURIComponent(params.ref)}`}
        className="btn-coral w-full justify-center mt-5" rel="noreferrer">
        Join my interview
      </a>
      <p className="text-xs text-muted-2 mt-3">
        If the interviewer is not there yet, stay on the call. They will join you.
      </p>
      <Tips />
    </Shell>
  );
}

function Tips() {
  return (
    <ul className="text-xs text-muted-2 mt-5 space-y-1 text-left list-disc pl-4">
      <li>You do not need an account or an app.</li>
      <li>A laptop with Chrome works best. On a phone, allow the browser to use your camera and microphone.</li>
      <li>Find a quiet place, and check your data or Wi Fi before you join.</li>
    </ul>
  );
}

function Shell({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center bg-paper px-5 py-16">
      <div className="card p-8 sm:p-10 w-full max-w-md text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Interview</p>
        <h1 className="font-display text-2xl font-semibold mb-2">{title}</h1>
        <p className="text-muted">{text}</p>
        {children}
      </div>
    </main>
  );
}
