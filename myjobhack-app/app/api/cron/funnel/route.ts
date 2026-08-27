import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";
import { dispatchDue } from "@/lib/campaigns";

export const runtime = "nodejs";
export const maxDuration = 120;

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

type Drip = {
  step: string; minDays: number; maxDays: number;
  qualifies: (admin: any, p: any) => Promise<boolean>;
  email: (first: string) => { subject: string; html: string };
  onSend?: (admin: any, p: any) => Promise<void>;
};

const DRIPS: Drip[] = [
  {
    step: "d1_profile", minDays: 1, maxDays: 3,
    qualifies: async (admin, p) => {
      const { data: t } = await admin.from("talent_profiles").select("profile_completion").eq("profile_id", p.id).maybeSingle();
      return (t?.profile_completion ?? 0) < 100;
    },
    email: (first) => ({
      subject: "Two minutes from a working profile",
      html: renderEmail({
        kicker: "Your profile is waiting",
        heading: "Finish it — then it hunts for you.",
        paragraphs: [`Hi ${first} — your MYJOBHACK profile is created but not yet complete.`,
          "A complete profile is what gets matched:"],
        bullets: ["Your niche and career goal drive training invites", "Your resume powers AI screening in your favor", "Complete profiles get seen first"],
        cta: { label: "Complete my profile", url: `${APP()}/portal/seeker/profile` }
      })
    })
  },
  {
    step: "d3_resume", minDays: 3, maxDays: 5,
    qualifies: async (admin, p) => {
      const { data: t } = await admin.from("talent_profiles").select("resume_document_id").eq("profile_id", p.id).maybeSingle();
      return !t?.resume_document_id;
    },
    email: (first) => ({
      subject: "One upload unlocks everything",
      html: renderEmail({
        kicker: "Missing piece",
        heading: "Your resume is the engine.",
        paragraphs: [`${first}, without a resume on file you can't apply to roles — and the AI tools have nothing to work with.`],
        bullets: ["Attaches automatically to every application", "Compressed and stored privately", "Takes thirty seconds"],
        cta: { label: "Upload my resume", url: `${APP()}/portal/seeker/profile` }
      })
    })
  },
  {
    // Has a CV but no structured work history — their profile is far weaker to
    // employers than it needs to be, and the fix is now one click.
    step: "d5_import_experience", minDays: 5, maxDays: 8,
    qualifies: async (admin, p) => {
      const { data: t } = await admin.from("talent_profiles")
        .select("resume_document_id").eq("profile_id", p.id).maybeSingle();
      if (!t?.resume_document_id) return false;
      const { count } = await admin.from("work_experiences")
        .select("id", { count: "exact", head: true }).eq("talent_id", p.id);
      return (count ?? 0) === 0;
    },
    email: (first) => ({
      subject: "Employers can't see your experience yet",
      html: renderEmail({
        kicker: "Two minutes",
        heading: `${first}, your work history is empty`,
        paragraphs: [
          "Employers on MYJOBHACK evaluate a structured profile rather than a CV attachment. Your résumé is on file, but your work history section is blank — so you're being judged on less than you've actually done.",
          "You don't need to retype it. We can read the roles straight out of the résumé you already uploaded, and you just check they're right."
        ],
        bullets: [
          "Takes about two minutes",
          "You review every entry before it saves",
          "A fuller profile ranks higher when employers search"
        ],
        cta: { label: "Import my experience", url: `${APP()}/portal/seeker/experience` }
      })
    })
  },
  {
    step: "d7_toolkit", minDays: 7, maxDays: 9,
    qualifies: async (admin, p) => {
      const { data: s } = await admin.from("subscriptions").select("id").eq("profile_id", p.id).limit(1);
      return (s ?? []).length === 0;
    },
    email: (first) => ({
      subject: "The unfair advantage, from ₦2,000",
      html: renderEmail({
        kicker: "The Career Toolkit",
        heading: "Most CVs have loopholes. Find yours.",
        paragraphs: [`${first}, the Career Toolkit is what separates applying from applying well:`],
        bullets: ["Resume review that hunts weaknesses recruiters see", "Interview prep built from YOUR actual resume", "Skills gap analysis with a 6-month plan", "Single tools from ₦2,000 — or the full kit"],
        cta: { label: "See the toolkit", url: `${APP()}/portal/seeker/subscription` }
      })
    })
  },
  {
    step: "d14_apply", minDays: 14, maxDays: 16,
    qualifies: async (admin, p) => {
      const { data: a } = await admin.from("applications").select("id").eq("talent_id", p.id).limit(1);
      return (a ?? []).length === 0;
    },
    email: (first) => ({
      subject: "Roles are moving — you haven't",
      html: renderEmail({
        kicker: "Open roles",
        heading: "Your first application is the hardest.",
        paragraphs: [`${first}, roles on MYJOBHACK auto-shortlist qualified applicants — no black hole, no silence.`],
        bullets: ["Your resume attaches automatically", "Meet the criteria → shortlisted instantly", "Track every application's status live"],
        cta: { label: "Browse open roles", url: `${APP()}/portal/seeker/jobs` }
      })
    })
  },
  {
    // FINAL TOUCH — day 21+, still no meaningful action. One honest last email,
    // then the account is flagged dormant so the funnel stops nudging.
    step: "d21_lastcall", minDays: 21, maxDays: 60,
    qualifies: async (admin, p) => {
      const { data: t } = await admin.from("talent_profiles").select("profile_completion, resume_document_id").eq("profile_id", p.id).maybeSingle();
      const { data: a } = await admin.from("applications").select("id").eq("talent_id", p.id).limit(1);
      const inactive = (t?.profile_completion ?? 0) < 50 && !t?.resume_document_id && (a ?? []).length === 0;
      return inactive;
    },
    email: (first) => ({
      subject: "Should we keep your spot?",
      html: renderEmail({
        kicker: "One last thing",
        heading: "We'll stop emailing after this.",
        paragraphs: [
          `${first}, you signed up but haven't set up your profile yet — so employers can't find you, and we don't want to keep filling your inbox.`,
          "If now isn't the time, no problem. If it is, everything's still here and takes about four minutes."
        ],
        bullets: ["Your account and any progress are saved", "Come back whenever you're ready", "This is the last nudge you'll get"],
        cta: { label: "Finish my profile", url: `${APP()}/portal/seeker` }
      })
    }),
    onSend: async (admin, p) => {
      // flag dormant so no further drips target them
      await admin.from("profiles").update({ funnel_status: "dormant" }).eq("id", p.id);
    }
  }
];

export async function GET(request: Request) {
  // Vercel Cron identifies itself with a user-agent; it does NOT send an
  // Authorization header unless you configure one. Requiring a bearer token
  // therefore silently rejected every scheduled run — which is why no funnel
  // email had ever sent. Accept either signal.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const ua = request.headers.get("user-agent") ?? "";
  const isVercelCron = ua.includes("vercel-cron");
  if (secret && !isVercelCron && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: cfg } = await admin.from("app_settings").select("value").eq("key", "funnel").maybeSingle();
  if ((cfg?.value as any)?.enabled === false)
    return NextResponse.json({ ok: true, sent: 0, skipped: "The funnel is disabled in settings." });

  if (!process.env.RESEND_API_KEY)
    return NextResponse.json({ ok: false, sent: 0, error: "RESEND_API_KEY is not set — nothing can send." }, { status: 500 });

  // Invite guest applicants into the pool — the warmest supply we touch.
  let applicantInvites = { invited: 0, skipped_existing: 0 };
  try {
    const { inviteApplicantsToPool } = await import("@/lib/applicantInvites");
    applicantInvites = await inviteApplicantsToPool();
  } catch { /* never let this block the drip emails */ }

  const now = Date.now();
  let sent = 0;

  for (const drip of DRIPS) {
    const newest = new Date(now - drip.minDays * 864e5).toISOString();
    const oldest = new Date(now - drip.maxDays * 864e5).toISOString();
    const { data: profiles } = await admin.from("profiles")
      .select("id, email, full_name")
      .in("role", ["job_seeker", "elite_member"])
      .gte("created_at", oldest).lte("created_at", newest)
      .limit(200).neq("funnel_status", "dormant");

    for (const p of profiles ?? []) {
      if (!p.email) continue;
      const { data: logged } = await admin.from("funnel_emails")
        .select("id").eq("profile_id", p.id).eq("step", drip.step).maybeSingle();
      if (logged) continue;
      if (!(await drip.qualifies(admin, p))) continue;
      const first = (p.full_name || "there").split(" ")[0];
      const m = drip.email(first);
      const res = await sendEmail(p.email, m.subject, m.html);
      await admin.from("funnel_emails").insert({ profile_id: p.id, step: drip.step });
      if ((drip as any).onSend) { try { await (drip as any).onSend(admin, p); } catch {} }
      if (!res.error) sent++;
    }
  }
  // scheduled campaigns due by now ride the same daily train
  const campaignsFired = await dispatchDue(admin);
  return NextResponse.json({ ok: true, applicant_invites: applicantInvites, sent, campaignsFired });
}
