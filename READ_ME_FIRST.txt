MyJobHack - start date fix for CSV offer uploads
Date: 3 October 2026

HOW TO APPLY
Unzip this over the root of the myjobhack-app folder, keeping the folder
structure. It will replace one file and add one migration. Then commit and push
as usual, and Vercel will deploy.

WHAT IS IN HERE

1. lib/recipientCsv.ts            REPLACES the existing file
   The start date column in an uploaded CSV is now recognised however it is
   worded: Start Date, start_date, START-DATE, Resumption Date, Resumption,
   Commencement Date, Date Joined, Joining Date, Effective Date, Onboarding
   Date, Proposed Start Date, Expected Resumption, Date of Resumption, or a
   bare Date. Brackets, underscores, hyphens and capitals no longer matter.
   Starting Salary and Date of Birth are still excluded on purpose.

   Date values may now carry a time or a weekday, which is how most
   spreadsheet and database exports write them:
     15/09/2026 00:00
     15/09/2026 00:00:00
     2026-09-15T00:00:00.000Z
     Mon, 15 Sep 2026
   On top of what already worked: 15/09/2026, 2026-09-15, 15 September 2026,
   15-Sep-2026, September 15 2026, 15th Sept 2026, 1/10/26, and Excel's raw
   serial number such as 46280.

   Numeric dates are read day first, so 05/09/2026 is 5 September.

   Two messages were added to the preview so this cannot fail silently again:
   when no start date column is recognised it now says so and explains that the
   shared start date will be used, and an unreadable value now names the
   accepted formats.

2. supabase/migrations/0057_offer_signed_copy.sql      RUN THIS ONCE
   Only needed if you have not run it yet. Paste it into the Supabase SQL
   editor. Safe to run more than once. Nothing in the start date fix depends
   on it; it is the signed offer copy work from earlier.

NOTE
Only .sql files go into the Supabase SQL editor. The .ts file goes into the
repository.

HOW TO CONFIRM IT IS LIVE
Open the offer sending screen, paste two lines:
  Name,Email,start_date
  Test Person,test@example.com,15/09/2026 00:00
The preview should read back 15 September 2026.
