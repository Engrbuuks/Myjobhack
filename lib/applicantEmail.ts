/**
 * Personalising a message sent to many applicants at once.
 *
 * The compose box already inserted "Hi Firstname," and left the rest fixed.
 * That is enough for a status update and not enough for an invitation: asking
 * thirty people to come to the office means naming the role they applied for,
 * the day you want them, and where to go, and doing that by hand thirty times
 * is how the wrong date reaches somebody.
 *
 * Tokens are filled per recipient from their own application, so one message
 * produces thirty correct ones.
 */

export type ApplicantVars = {
  first_name: string;
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  location: string;
  stage: string;
  sender: string;
  /** Free text the sender fills in once, used for things like a date. */
  detail: string;
};

export const APPLICANT_TOKENS: { token: string; means: string }[] = [
  { token: "{first_name}", means: "Ada" },
  { token: "{name}", means: "Ada Okafor" },
  { token: "{role}", means: "the job they applied for" },
  { token: "{company}", means: "the hiring company" },
  { token: "{location}", means: "the location they gave" },
  { token: "{phone}", means: "their phone number" },
  { token: "{stage}", means: "where they are in the process" },
  { token: "{sender}", means: "your name" },
  { token: "{detail}", means: "the note you write once, below" }
];

/**
 * A starting point for the common case: asking people to come in.
 *
 * Deliberately specific about what to bring and who to ask for, because a
 * vague invitation produces thirty phone calls asking the same question.
 */
export const OFFICE_INVITE_SUBJECT = "Please come in to see us about {role}";

export const OFFICE_INVITE_BODY = `Hello {first_name},

Thank you for applying for {role}. We would like to meet you in person.

{detail}

Please bring a valid means of identification and a copy of your CV. When you arrive, ask for reception and say you are here about the {role} role.

If you cannot make it, reply to this email and we will arrange another time.

{sender}`;

export function renderApplicantTemplate(template: string, vars: ApplicantVars): string {
  return (template || "").replace(/\{(\w+)\}/g, (whole, key) => {
    const v = (vars as any)[key];
    return v === undefined || v === null || v === "" ? whole : String(v);
  });
}

/** Tokens the template uses that we cannot fill for this batch. */
export function checkTokens(template: string, vars: ApplicantVars): {
  unknown: string[]; empty: string[];
} {
  const re = /\{(\w+)\}/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(template || "")) !== null) found.push(m[1]);
  const uniq = Array.from(new Set(found));
  return {
    unknown: uniq.filter((k) => !(k in vars)),
    empty: uniq.filter((k) => k in vars && !(vars as any)[k])
  };
}

export function applicantVars(opts: {
  name: string; role: string; company: string; email: string;
  phone?: string; location?: string; stage?: string; sender: string; detail?: string;
}): ApplicantVars {
  const name = opts.name || "there";
  return {
    first_name: name.split(" ")[0],
    name,
    role: opts.role,
    company: opts.company,
    email: opts.email,
    phone: opts.phone ?? "",
    location: opts.location ?? "",
    stage: (opts.stage ?? "").replace(/_/g, " "),
    sender: opts.sender,
    detail: opts.detail ?? ""
  };
}

export function toParagraphs(text: string): string[] {
  return (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}
