/**
 * What a candidate is told after their interview has been decided.
 *
 * The desk has always said "the candidate is notified either way". It was not
 * true: the outcome action wrote an in app notification keyed on the profile
 * id, which is null for a guest so the row was rejected, and it sent no email
 * to anybody. Advance and reject both ended in silence.
 *
 * Written as editable plain text in the same shape as the invitation and
 * cancellation copy, so all the interview correspondence reads as one voice.
 */

export const ADVANCED_SUBJECT = "Good news about your interview for {role}";

/**
 * Says what was decided and nothing about when the next step comes. A date we
 * invent here is a date the hiring team never agreed to, and a candidate who
 * is told "within a week" stops looking elsewhere for a week.
 */
export const ADVANCED_BODY = `Hello {first_name},

Thank you for making time for your interview for {role}.

The team has decided to take your application forward to the next stage.

We will write to you at this address about what comes next. We cannot give you a date for that, so please carry on with your other applications in the meantime.

Congratulations, and thank you for your patience.`;

export const HOLD_SUBJECT = "An update on your interview for {role}";

/**
 * Hold is the outcome most worth sending. The candidate is still in the
 * running and hears nothing, which reads exactly like a rejection nobody had
 * the courage to send.
 */
export const HOLD_BODY = `Hello {first_name},

Thank you for making time for your interview for {role}.

The team has not reached a decision yet. Your application is still open and still being considered, so there is nothing you need to do.

We will write to you at this address once there is a decision. We cannot give you a date for that, so please carry on with your other applications in the meantime.

Thank you for your patience.`;

export const REJECTED_SUBJECT = "An update on your interview for {role}";

/**
 * Plain, and without the softeners that make a rejection ambiguous. Someone
 * who cannot tell whether they were rejected keeps waiting.
 */
export const REJECTED_BODY = `Hello {first_name},

Thank you for making time for your interview for {role}.

The team has decided not to take your application further for this role. We know that is not the news you were hoping for, and we are grateful you gave us your time.

This decision is about this one role only. Your details stay with us, and you are welcome to apply for other roles on MYJOBHACK.

We wish you well.`;

export const OUTCOME_COPY: Record<string, {
  subject: string; body: string; kicker: string; heading: string; preheader: string;
}> = {
  advanced: {
    subject: ADVANCED_SUBJECT, body: ADVANCED_BODY,
    kicker: "Interview outcome",
    heading: "You are going through to the next stage.",
    preheader: "The team is taking your application forward."
  },
  hold: {
    subject: HOLD_SUBJECT, body: HOLD_BODY,
    kicker: "Interview outcome",
    heading: "Your application is still being considered.",
    preheader: "No decision yet, and nothing for you to do."
  },
  rejected: {
    subject: REJECTED_SUBJECT, body: REJECTED_BODY,
    kicker: "Interview outcome",
    heading: "An update on your application.",
    preheader: "A decision has been made on this role."
  }
};
