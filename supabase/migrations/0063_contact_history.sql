-- ============================================================
-- 0063 · Make "who have we already emailed" a question the app can answer.
--
-- Run after 0062. Safe to run more than once.
--
-- THE PROBLEM THIS SOLVES. Every send is already recorded in email_log, but
-- nothing reads it back. So after emailing some people at the offered stage
-- and then adding more people to that stage, there is no way to tell the two
-- groups apart in the applicant list, and the only safe options are to email
-- nobody or to email everybody twice.
--
-- Two changes, both small:
--   1 · a tag, so a repeat of the SAME message can be recognised exactly,
--       rather than guessed from a subject line that may contain tokens
--   2 · indexes, so the lookup is cheap enough to run on every page load
-- ============================================================

-- A short label for what this message was, set by the sender or derived from
-- the subject. The subject alone is a poor key: it carries tokens such as
-- {first_name}, and it changes when the wording is edited slightly, which
-- would make the same message look like a new one.
alter table email_log add column if not exists tag text;

comment on column email_log.tag is
  'What this message was, for recognising a repeat. Derived from the subject when the sender does not set one.';

-- One address, one spelling.
--
-- This column used to be write only, so the case it was written in never
-- mattered. It is now looked up, and a lookup for 'ada@gmail.com' does not
-- find a row stored as 'Ada@Gmail.com'. That failure is the exact one this
-- migration exists to prevent: the person reads as never contacted and gets
-- the message twice. Email addresses are treated case insensitively in
-- practice, and the authoritative copy of each address lives in profiles and
-- applications, not in this log.
update email_log
   set recipient = lower(trim(recipient))
 where recipient is not null
   and recipient <> lower(trim(recipient));

-- The two questions asked of this table, both of which were full scans.
create index if not exists email_log_application_idx
  on email_log (application_id, sent_at desc)
  where application_id is not null;

create index if not exists email_log_recipient_idx
  on email_log (lower(recipient), sent_at desc);

create index if not exists email_log_tag_idx
  on email_log (tag, lower(recipient))
  where tag is not null and status = 'sent';

-- Backfill a tag for history already recorded, so the first use of this
-- feature knows about the emails sent before it existed. The same
-- normalisation the application uses: lowercased, collapsed whitespace,
-- template tokens removed.
update email_log
   set tag = left(
         regexp_replace(
           regexp_replace(lower(subject), '\{[^}]*\}', '', 'g'),
           '\s+', ' ', 'g'
         ), 120)
 where tag is null
   and subject is not null;

do $$
declare
  n int;
begin
  select count(*) into n from email_log where tag is null and subject is not null;
  if n > 0 then
    raise exception '0063 did not take: % rows still have no tag.', n;
  end if;

  select count(*) into n from email_log
   where recipient is not null and recipient <> lower(trim(recipient));
  if n > 0 then
    raise exception '0063 did not take: % recipients are still mixed case.', n;
  end if;
  raise notice '0063 applied. The applicant list can now show who has been emailed, and the composer can skip anyone who already received the same message.';
end $$;
