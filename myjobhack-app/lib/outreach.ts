/**
 * Outreach templates from the Winning Employers playbook.
 *
 * These pre-fill everything the system knows. The ONE thing they deliberately
 * leave blank is the personal observation in the opening line — that is what
 * makes these emails work, and no template can write it.
 */

export type Prospect = {
  company: string;
  contact_name: string | null;
  contact_role?: string | null;
  city?: string | null;
  hires_roles?: string | null;
  hiring_now: boolean;
};

export type OutreachTemplate = {
  key: string;
  label: string;
  when: string;                  // guidance on when to use it
  subject: (p: Prospect) => string;
  body: (p: Prospect, ctx?: { poolCount?: number }) => string;
};

const first = (name: string | null | undefined) =>
  (name || "there").trim().split(/\s+/)[0];

const roles = (p: Prospect) => p.hires_roles?.trim() || "[role type]";

export const TEMPLATES: OutreachTemplate[] = [
  {
    key: "hr_lead",
    label: "1 · HR / Talent Acquisition lead",
    when: "They are hiring now, and the contact owns hiring quality.",
    subject: (p) => `Cutting your interview load on ${roles(p)} hires`,
    body: (p) => `Hi ${first(p.contact_name)},

I saw ${p.company} is hiring ${roles(p)} — [ADD ONE SPECIFIC OBSERVATION: a posting you saw, an expansion, an office opening].

Most teams hiring for that role tell us the same thing: applications arrive in the hundreds, and you only find out who can actually do the work three interviews in.

We run MYJOBHACK, a talent platform in Nigeria that does the filtering before you ever see a CV. Every candidate takes a practical, role-specific assessment, so each one arrives with a competency band you can act on — not just a claim on paper.

Would you be open to a 15-minute call? I can show you the assessed candidates we already have in ${roles(p)}, and you can judge the quality yourself. No cost to look.

If it isn't useful, I won't follow up again.`
  },
  {
    key: "agency",
    label: "2 · Recruitment agency / HR consultancy",
    when: "The contact places people for their own clients.",
    subject: () => `A pre-assessed candidate pool your clients would notice`,
    body: (p) => `Hi ${first(p.contact_name)},

You place ${roles(p)} for clients across ${p.city || "[region]"} — so your reputation depends on how good your shortlist is and how fast you produce it.

We built MYJOBHACK to solve exactly that. Every candidate completes a practical, field-specific assessment before entering the pool. You can filter by competency band, seniority and location, and pull a shortlist in minutes rather than days of sourcing.

Agencies use us two ways: subscription access to search the pool directly, or a per-placement arrangement where you only pay when a candidate you found through us is hired.

Could we speak for 15 minutes this week? I'd rather show you the pool in your specialist area than describe it — you'll know within five minutes whether the quality is there.`
  },
  {
    key: "volume_ops",
    label: "3 · Operations lead with a volume need",
    when: "They are filling many seats at once.",
    subject: (p) => `Filling ${roles(p)} seats without the usual scramble`,
    body: (p) => `Hi ${first(p.contact_name)},

${p.company} is expanding ${p.city ? `in ${p.city}` : ""} — congratulations. [ADD ONE SPECIFIC OBSERVATION.] If it's anything like the other operations we work with, the hardest part isn't finding applicants, it's finding the ones who'll still be there in month three.

MYJOBHACK is built for exactly this. One posting can carry 50 or 100 openings. Every applicant has already taken a practical assessment for that kind of role, so you're shortlisting from people who have demonstrated the work — and you can move fifty candidates through the pipeline at once rather than one at a time.

If you have a batch of seats to fill this quarter, I'd like to show you what we can put in front of you. Fifteen minutes, and I'll bring real candidate profiles in your field.`
  },
  {
    key: "not_hiring",
    label: "4 · Hires often, but not hiring today",
    when: "The largest group. Use this for anyone with nothing open right now.",
    subject: (p) => `For when you're next hiring ${roles(p)}`,
    body: (p, ctx) => `Hi ${first(p.contact_name)},

I'm not writing about a vacancy — as far as I can see you don't have one open right now.

I'm writing because ${p.company} hires ${roles(p)} regularly, and when that next comes round I'd like you to already know we exist.

We run MYJOBHACK. Every candidate in our pool has completed a practical, role-specific assessment, so they arrive with a competency band rather than just a CV claim. For ${roles(p)} specifically, we currently hold ${ctx?.poolCount ?? "[NUMBER]"} assessed candidates${p.city ? ` in ${p.city}` : ""}.

Two things I can do without taking up your time:

1. Send you three anonymised profiles in ${roles(p)} — so when you do need someone, you already know the standard.
2. Flag you first when a strong ${roles(p)} candidate joins the pool, if that would be useful.

No call needed. Just reply "yes" to either and I'll set it up.`
  },
  {
    key: "follow_up_1",
    label: "Follow-up 1 · four days later",
    when: "No reply to the opener.",
    subject: (p) => `Re: ${p.hiring_now ? `Cutting your interview load on ${roles(p)} hires` : `For when you're next hiring ${roles(p)}`}`,
    body: (p) => `Hi ${first(p.contact_name)},

Bringing this back to the top of your inbox in case it got buried.

One concrete thing I can do without any commitment: send you three assessed candidate profiles in ${roles(p)} so you can judge the standard yourself. Would that be useful?`
  },
  {
    key: "follow_up_2",
    label: "Follow-up 2 · ten days after the opener",
    when: "Final message. Two follow-ups, then stop.",
    subject: () => `Closing the loop`,
    body: (p) => `Hi ${first(p.contact_name)},

I don't want to keep landing in your inbox, so this is my last note on this.

If hiring ${roles(p)} becomes a priority later in the year, we'll be here — myjobhack.co. And if there's someone else at ${p.company} who owns hiring for these roles, I'd be grateful for a name.

All the best,`
  },
  {
    key: "quarterly",
    label: "Quarterly nudge · the not-yet list",
    when: "Every three months, to companies on the quarterly list. Send real candidates, never 'just checking in'.",
    subject: (p) => `Three ${roles(p)} candidates worth knowing about`,
    body: (p) => `Hi ${first(p.contact_name)},

Quick one — three strong ${roles(p)} candidates joined our pool this month, all assessed${p.city ? ` and based in ${p.city}` : ""}.

Profiles attached in case they're useful now or later. No reply needed unless you want an introduction.`
  }
];

export function templateByKey(key: string) {
  return TEMPLATES.find(t => t.key === key) ?? TEMPLATES[0];
}

/** Which template the system suggests, based on where the prospect stands. */
export function suggestTemplate(p: { hiring_now: boolean; stage: string; contact_role?: string | null }): string {
  if (p.stage === "contacted") return "follow_up_1";
  if (p.stage === "follow_up_1") return "follow_up_2";
  if (p.stage === "not_now") return "quarterly";
  if (!p.hiring_now) return "not_hiring";
  const role = (p.contact_role || "").toLowerCase();
  if (role.includes("agency") || role.includes("recruit") || role.includes("consult")) return "agency";
  if (role.includes("ops") || role.includes("operation")) return "volume_ops";
  return "hr_lead";
}

/** The stage a prospect moves to after a given template is sent. */
export function stageAfterSend(templateKey: string, current: string): string {
  switch (templateKey) {
    case "follow_up_1": return "follow_up_2" === current ? current : "follow_up_1";
    case "follow_up_2": return "follow_up_2";
    case "quarterly":   return "not_now";
    default:            return current === "to_contact" ? "contacted" : current;
  }
}

/** Days until the next action, per the playbook's two-follow-ups-then-stop rule. */
export function nextActionAfter(templateKey: string): { days: number | null; action: string } {
  switch (templateKey) {
    case "follow_up_1": return { days: 6,  action: "Send final follow-up (then stop)" };
    case "follow_up_2": return { days: 90, action: "Move to quarterly list — nudge with real candidates" };
    case "quarterly":   return { days: 90, action: "Next quarterly nudge" };
    default:            return { days: 4,  action: "Send follow-up 1" };
  }
}
