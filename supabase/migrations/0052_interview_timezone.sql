-- 0052 · Record the timezone each interview was scheduled in, and correct
--        times that were stored in the wrong one.
--
-- THE PROBLEM: slots were built using the server's timezone, which on Vercel
-- is UTC. A slot meant as 09:00 in Lagos was stored as 09:00 UTC, which is
-- 10:00 in Lagos. The invitation email rendered server side and said 09:00.
-- The interviews list rendered in the browser and said 10:00. Candidates
-- acted on the email, so the email is treated as the truth here.
--
-- Only rows written by the bulk scheduler are corrected. Interviews arranged
-- one at a time were entered against a real clock and are already right.

begin;

alter table public.interviews
  add column if not exists timezone text not null default 'Africa/Lagos';

comment on column public.interviews.timezone is
  'The zone the interview time was agreed in. Always format the display in this zone, never in the viewer or server local time.';

-- ---------- 1 · Remove the guard for the duration of the shift ----------
--
-- Moving a batch back an hour otherwise fails halfway: a row moving from
-- 10:00 onto 09:00 collides with the row still sitting at 09:00.
--
-- SCHEMA QUALIFIED ON PURPOSE. An unqualified "drop index if exists" resolves
-- against search_path, and if that does not include public the statement
-- silently succeeds while dropping nothing. The update then fails with a
-- duplicate key error that looks like a data problem but is not.
drop index if exists public.interviews_no_double_booking;

-- Prove it actually went, rather than trusting IF EXISTS.
do $$
begin
  if exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'interviews_no_double_booking'
  ) then
    raise exception 'The unique index could not be dropped, so the times cannot be corrected safely. Run: drop index public.interviews_no_double_booking; then run this migration again.';
  end if;
end $$;

-- ---------- 2 · Correct the stored instants ----------
update public.interviews
   set scheduled_at = scheduled_at - interval '1 hour'
 where scheduled_at is not null
   and batch_id is not null
   and timezone = 'Africa/Lagos';

-- ---------- 3 · Refuse to continue if that double books anyone ----------
--
-- A clash here means two candidates were genuinely told the same time. Which
-- one gives way is a judgement about real people, so this stops and names
-- them rather than cancelling one by an arbitrary tiebreak.
do $$
declare
  clash_count int;
  detail text;
begin
  select count(*), string_agg(msg, chr(10))
    into clash_count, detail
  from (
    select format('  %s Lagos: %s',
             to_char(scheduled_at at time zone 'Africa/Lagos', 'Dy DD Mon HH24:MI'),
             string_agg(coalesce(guest_name, talent_id::text, id::text), ' and ')) as msg
      from public.interviews
     where scheduled_at is not null and status <> 'cancelled'
     group by job_id, scheduled_at
    having count(*) > 1
  ) clashes;

  if coalesce(clash_count, 0) > 0 then
    raise exception E'Correcting the times would double book % slot(s):\n%\n\nNothing has been changed. Cancel or move one interview in each pair, then run this migration again.',
      clash_count, detail;
  end if;
end $$;

-- ---------- 4 · Put the guard back ----------
create unique index interviews_no_double_booking
  on public.interviews (job_id, scheduled_at)
  where scheduled_at is not null and status <> 'cancelled';

commit;
