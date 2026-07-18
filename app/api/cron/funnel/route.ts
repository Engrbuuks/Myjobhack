import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 120;

const APP = () => process.env.NEXT_PUBLIC_APP_URL || "https://app.myjobhack.co";

type Drip = {
  step: string; minDays: number; maxDays: number;
  qualifies: (admin: any, p: any) => Promise<boolean>;
  email: (first: string) => { subject: string; html: string };
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
  }
];

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: cfg } = await admin.from("app_settings").select("value").eq("key", "funnel").maybeSingle();
  if ((cfg?.value as any)?.enabled === false) return NextResponse.json({ ok: true, skipped: "disabled" });

  const now = Date.now();
  let sent = 0;

  for (const drip of DRIPS) {
    const newest = new Date(now - drip.minDays * 864e5).toISOString();
    const oldest = new Date(now - drip.maxDays * 864e5).toISOString();
    const { data: profiles } = await admin.from("profiles")
      .select("id, email, full_name")
      .in("role", ["job_seeker", "elite_member"])
      .gte("created_at", oldest).lte("created_at", newest)
      .limit(200);

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
      if (!res.error) sent++;
    }
  }
  return NextResponse.json({ ok: true, sent });
}
