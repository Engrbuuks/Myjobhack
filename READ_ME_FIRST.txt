MyJobHack - interviews: the stale page fix, plus the diagnostic
Date: 7 October 2026
This zip is CUMULATIVE. It contains everything from the interview rebuild
earlier today as well. If you have not applied that one yet, this replaces it.

HOW TO APPLY
Unzip over the root of the myjobhack-app folder, keeping the folder structure.
No database migration. Commit, push, deploy.

  lib/interviews.ts                            replaced
  components/InterviewDesk.tsx                 replaced
  app/portal/admin/interviews/page.tsx         replaced
  app/portal/employer/interviews/page.tsx      replaced
  app/api/admin/manage/route.ts                replaced
  app/api/admin/interview-doctor/route.ts      NEW
  next.config.mjs                              replaced - SEE THE NOTE BELOW

NOTE ON next.config.mjs
If your deployed next.config.mjs has anything in it that mine does not, do not
overwrite it. Instead add this one line inside the existing "experimental"
block and leave everything else alone:

    staleTimes: { dynamic: 0, static: 0 }

That line is the actual fix for the symptom you described.

WHAT WAS WRONG

Both of your symptoms are the same fault. New interviews not appearing, and
deleted ones coming back, is what a cached page looks like.

The App Router keeps a copy of each page in the browser after it renders it,
and by default reuses that copy for 30 seconds when you navigate to the page
again, without asking the server at all. So:

  you schedule 20 interviews, navigate to Interviews, and are handed the copy
  taken before they existed;

  you delete some, the list updates, you navigate away, come back, and are
  handed the copy taken before the deletion.

Nothing was wrong with the database in either case. Setting staleTimes to zero
makes every navigation ask the server. These pages are server rendered on
demand anyway, so nothing is lost but the stale copy. The page also now calls
noStore(), which stops the rendered output being kept and handed out again.

HOW TO BE SURE, RATHER THAN TRUST ME

A new endpoint reads the interviews table with the service role and no cache,
so what it returns is the live table. Open it in a browser while signed in as
staff:

  https://app.myjobhack.co/api/admin/interview-doctor

It reports the total, the count by status, the 30 most recently created rows
with their creation times, and the last 5 bulk runs with a verdict on each.

Reading it:

  the 20 are listed there but not on the page   -> the page was stale, reload
  the 20 are not listed there                   -> they were never saved
  a batch says MISMATCH                         -> emails went out but the
                                                   interview rows were
                                                   rejected, almost always by
                                                   the double booking index

You can narrow it:
  /api/admin/interview-doctor?job=<job id>
  /api/admin/interview-doctor?email=someone@example.com

ONE THING TO CHECK FIRST

"Email invite to 20 persons" could mean two different features. The bulk email
tool on the applicant list sends a personalised message and creates no
interview, by design, so nothing from it will ever appear under Interviews.
Only the interview scheduler creates interviews. If the doctor shows no new
rows and no new batch, that is what happened, and the fix is to schedule them
through the interview invitation flow instead.

ALSO ADDED
The Interviews page now shows how many rows came back and the time it read
them, with a "Reload from the database" button and a link to the doctor. A list
that is empty because it is stale and a list that is empty because there is
nothing in it used to look identical.
