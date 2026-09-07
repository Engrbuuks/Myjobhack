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
--
-- IF THIS MIGRATION STOPS WITH A CLASH MESSAGE, that is deliberate. It means
-- correcting the times would put two live interviews at the same moment, and
-- which one gives way is a judgement about real people, not something a
-- migration should decide silently. The message names them. Resolve, rerun.

begin;

alter table interviews
  add column if not exists timezone text not null default 'Africa/Lagos';

comment on column interviews.timezone is
  'The zone the interview time was agreed in. Always format the display in this zone, never in the viewer or server local time.';

-- The unique index is dropped for the shift and rebuilt after. Moving a whole
-- batch back an hour otherwise fails halfway: a row moving from 10:00 onto
-- 09:00 collides with the row still sitting at 09:00.
drop index if exists interviews_no_double_booking;

update interviews
   set scheduled_at = scheduled_at - interval '1 hour'
 where scheduled_at is not null
   and batch_id is not null
   and timezone = 'Africa/Lagos';

-- Refuse to continue if the corrected times double book anyone.
do $$
declare
  clash_count int;
  detail text;
begin
  select count(*), string_agg(msg, chr(10))
    into clash_count, detail
  from (
    select format('  %s Lagos on job %s: %s',
             to_char(scheduled_at at time zone 'Africa/Lagos', 'Dy DD Mon HH24:MI'),
             job_id,
             string_agg(coalesce(guest_name, talent_id::text, id::text), ' and ')) as msg
      from interviews
     where scheduled_at is not null and status <> 'cancelled'
     group by job_id, scheduled_at
    having count(*) > 1
  ) clashes;

  if coalesce(clash_count, 0) > 0 then
    raise exception E'Correcting the times would double book % slot(s):\n%\n\nNothing has been changed. Cancel or move one interview in each pair, then run this migration again.',
      clash_count, detail;
  end if;
end $$;

create unique index interviews_no_double_booking
  on interviews (job_id, scheduled_at)
  where scheduled_at is not null and status <> 'cancelled';

commit;

-- Check the result against what candidates were actually told:
--
--   select i.scheduled_at at time zone 'Africa/Lagos' as lagos_time,
--          coalesce(p.full_name, i.guest_name) as candidate, i.status
--     from interviews i
--     left join profiles p on p.id = i.talent_id
--    where i.status <> 'cancelled' and i.scheduled_at is not null
--    order by i.scheduled_at;
