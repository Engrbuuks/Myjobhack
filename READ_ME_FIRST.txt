MyJobHack - interview management rebuild
Date: 7 October 2026

HOW TO APPLY
Unzip over the root of the myjobhack-app folder, keeping the folder structure.
Five files are replaced. No database migration is needed. Commit, push, and
Vercel deploys.

  lib/interviews.ts                          replaced
  components/InterviewDesk.tsx               replaced
  app/portal/admin/interviews/page.tsx       replaced
  app/portal/employer/interviews/page.tsx    replaced
  app/api/admin/manage/route.ts              replaced

WHY IT BEHAVED THE WAY IT DID

1. The admin Interviews page read the table as the signed in user, so row
   level security decided what appeared. Interviews on MYJOBHACK jobs carry no
   org_id, and the org scoped policy returns nothing for them. The page now
   reads with the service role client. The portal layout already refuses anyone
   who is not admin or recruiter, so the gate sits upstream where it belongs.

2. The rows that did appear carried only a name, an email and a time. The CV,
   the phone, the company, the application and the fit score were each one
   query away and none of them were being fetched. Guests, who are most
   applicants, had no phone at all because the code read profiles.phone and a
   guest has no profile; the number lives on the application as guest_phone.

3. Delete was hidden on invited and scheduled interviews. The endpoint could
   always delete them, the button simply was not rendered, so a test row could
   only be removed by cancelling it and emailing a real candidate.

WHAT IS NEW

Details on every row
  CV opens through the same gated endpoint the applicant lists use, so
  redaction rules stay in one place. Phone falls back correctly for guests.
  Company, round, mode, fit score, a link into the application, the interview
  link where one was given, and the cancellation reason on cancelled rows.

Five counts above the list
  Today, next 7 days, awaiting a time, time has passed, needs an outcome.

"Time has passed" is new and is the one that was quietly costing you. An
interview only leaves the scheduled state when somebody marks a no-show or
saves a review. Nothing does that automatically, so an interview from three
weeks ago still sat at the top of the live list counted as upcoming, with its
application still held at interviewing where nobody looks at it again.

Filters and search
  Search by name, email, role, or phone. Phone search understands both forms:
  typing 0816 528 finds +2348165285609. Filter by job, by status, or by
  "needs attention", which means happened but unscored, or still open after
  its time. History is hidden by default behind a tick box.

Grouped by day, earliest first, with unscheduled interviews last rather than
first. An interview with no time is an outstanding task, not the thing you
need at the top on a morning when eleven people are coming in.

Select and act in bulk
  Tick rows, or a whole day, then cancel or delete the selection. Export the
  filtered list to CSV, or copy the email addresses.

Delete, at any status
  Delete and cancel are different things and the screen now says so before
  either one runs. Cancel keeps the record, frees the slot, emails the
  candidate and returns the application to shortlisted. Delete removes the
  record and emails nobody, for test rows and mistakes. Deleting also returns
  the application to shortlisted, but only when the candidate has no other
  live interview, so clearing a duplicate does not reset somebody who is still
  booked.

CSV export
  Date as yyyy-mm-dd so a spreadsheet sorts it, alongside the readable day.
  Phone prefixed with an apostrophe so Excel keeps it as text instead of
  reading +234... as a formula.

TESTED
Forty assertions over the row assembler, the day grouping, the counts, the
filters and the CSV, including guest and registered candidates, the timezone
rendering, and the phone search in both formats. A full production build
passes.

STILL OUTSTANDING ON YOUR SIDE
Migration 0057_offer_signed_copy.sql, if you have not run it yet. It belongs
to the offer letter work, not to this.
