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
  /** Only present on cancellation emails, and only when a reason is shared. */
  reason?: string;
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
  { token: "{timezone}", means: "Africa/Lagos" },
  { token: "{reason}", means: "the reason, if you choose to share one" }
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

/**
 * For a corrected invitation.
 *
 * A second email with a different time, and no acknowledgement that it
 * replaces the first, is how candidates end up at the wrong hour. This says
 * plainly that the earlier message should be ignored.
 */
export const CORRECTION_SUBJECT = "Corrected interview time: {role}";

export const CORRECTION_BODY = `Hello {first_name},

Please ignore our earlier interview invitation. It contained an error, and this message replaces it.

Your interview is on {date} at {time} ({timezone}) and will last about {duration} minutes.

Where: {location}

Please reply to this email to confirm this new time works for you. We are sorry for the confusion.`;

/**
 * For a cancelled interview.
 *
 * Cancelling silently is the worst option: the candidate keeps an invitation
 * for a time that no longer exists and travels to it. This says clearly that
 * it is off, and whether anything replaces it.
 */
export const CANCEL_SUBJECT = "Your interview for {role} has been cancelled";

export const CANCEL_BODY = `Hello {first_name},

We are writing to let you know that your interview for {role}, scheduled for {date} at {time} ({timezone}), has been cancelled.

Please do not attend at that time.

{reason}

Your application has not been rejected. We will be in touch if a new time becomes available.

We are sorry for the inconvenience.`;

/** When the cancellation is immediately followed by a new time. */
export const RESCHEDULE_SUBJECT = "New interview time for {role}";

export const RESCHEDULE_BODY = `Hello {first_name},

Your interview for {role} has been moved.

Please ignore the earlier time. Your interview is now on {date} at {time} ({timezone}) and will last about {duration} minutes.

Where: {location}

Please reply to confirm this time works for you. We are sorry for the change.`;

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
  duration: number; location: string; timezone: string; reason?: string;
}): EmailVars {
  const d = new Date(opts.slotIso);
  /**
   * Formatted in the interview's timezone, never the server's. Rendering
   * server side without a timeZone gave UTC, so an invitation said 09:00
   * while the same interview showed as 10:00 everywhere else.
   */
  const tz = opts.timezone || "Africa/Lagos";
  const date = d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
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
    reply_to: "",
    reason: opts.reason ?? ""
  };
}
