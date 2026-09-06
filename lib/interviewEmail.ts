/**
 * The interview invitation, written by you rather than by the system.
 *
 * The wording matters more than it looks. "Please allow 30 minutes" reads as
 * "block out half an hour" to one person and "the interview is exactly 30
 * minutes" to another, and a candidate who misjudges it either leaves early or
 * arrives anxious. Phrasing like that should be the recruiter's decision, so
 * the template is editable and the tokens fill in the facts.
 */

export type EmailVars = {
  name: string;
  first_name: string;
  role: string;
  company: string;
  date: string;        // Monday, 7 September
  time: string;        // 09:30
  day_and_time: string;
  duration: string;    // 30
  location: string;    // link or address, empty when neither
  timezone: string;
  reply_to: string;
};

export const TOKENS: { token: string; means: string }[] = [
  { token: "{first_name}", means: "Ada" },
  { token: "{name}", means: "Ada Okafor" },
  { token: "{role}", means: "the job title" },
  { token: "{company}", means: "your company name" },
  { token: "{date}", means: "Monday, 7 September" },
  { token: "{time}", means: "09:30" },
  { token: "{day_and_time}", means: "Monday, 7 September at 09:30" },
  { token: "{duration}", means: "30" },
  { token: "{location}", means: "the link or address" },
  { token: "{timezone}", means: "Africa/Lagos" }
];

export const DEFAULT_SUBJECT = "Interview invitation: {role}";

/**
 * Written to be unambiguous about time, which is the thing candidates most
 * often get wrong. It states the finish time as well as the start, so nobody
 * has to interpret "allow 30 minutes".
 */
export const DEFAULT_BODY = `Hello {first_name},

Thank you for applying for {role}. We would like to invite you to an interview.

Your interview is on {date} at {time} ({timezone}) and will last about {duration} minutes.

Where: {location}

Please reply to this email to confirm you can make it. If the time does not work for you, tell us and we will find another.

We look forward to speaking with you.`;

/** Replace every {token} with its value. Unknown tokens are left visible. */
export function renderTemplate(template: string, vars: EmailVars): string {
  return (template || "").replace(/\{(\w+)\}/g, (whole, key) => {
    const v = (vars as any)[key];
    return v === undefined || v === null || v === "" ? whole : String(v);
  });
}

/** Tokens in the template that we cannot fill. Surfaced before sending. */
export function unknownTokens(template: string, vars: EmailVars): string[] {
  return Array.from(new Set(tokensIn(template).filter((k) => !(k in vars))));
}

/** Every {token} in a template. Uses exec rather than matchAll, which needs a
 *  newer ES target than this project compiles to. */
function tokensIn(template: string): string[] {
  const re = /\{(\w+)\}/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(template || "")) !== null) out.push(m[1]);
  return out;
}

/**
 * Tokens that exist but have no value for this batch. Different from unknown:
 * {location} is a real token, but an empty one leaves "Where:" dangling, so
 * it is worth warning about rather than silently shipping.
 */
export function emptyTokens(template: string, vars: EmailVars): string[] {
  return Array.from(new Set(tokensIn(template).filter((k) => k in vars && !(vars as any)[k])));
}

/** Turn plain text into the paragraphs the email renderer expects. */
export function toParagraphs(text: string): string[] {
  return (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** Build the variables for one scheduled candidate. */
export function varsFor(opts: {
  name: string; role: string; company: string; slotIso: string;
  duration: number; location: string; timezone: string;
}): EmailVars {
  const d = new Date(opts.slotIso);
  const date = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return {
    name: opts.name,
    first_name: (opts.name || "there").split(" ")[0],
    role: opts.role,
    company: opts.company,
    date, time,
    day_and_time: `${date} at ${time}`,
    duration: String(opts.duration),
    location: opts.location,
    timezone: opts.timezone,
    reply_to: ""
  };
}
