-- ============================================================
-- 0061 · A rate limit that actually holds.
--
-- Run after 0060. Safe to run more than once.
--
-- WHY A TABLE AND NOT A VARIABLE: this app runs on Vercel, where each request
-- may land on a different instance, and instances come and go. A counter held
-- in memory therefore limits nothing: a script simply spreads its requests and
-- every one of them looks like the first. The state has to be somewhere both
-- instances can see, and the database is already there.
--
-- WHAT IT PROTECTS. The public endpoints had no limit of any kind. A script
-- could fill the applications table, drive the Gemini scoring budget, push
-- invented addresses into the marketing contacts, and drain the day's whole
-- email allowance in about ninety requests, after which offer letters, signup
-- confirmations and interview invitations all silently stopped sending.
-- ============================================================

create table if not exists rate_limit_hits (
  id bigserial primary key,
  bucket text not null,        -- what is being limited, e.g. 'public_apply'
  subject text not null,       -- who, e.g. an IP address or an email address
  created_at timestamptz not null default now()
);

-- The only query this table serves: how many hits in this bucket, for this
-- subject, since a moment. Everything else is cleanup.
create index if not exists rate_limit_hits_lookup_idx
  on rate_limit_hits (bucket, subject, created_at desc);

alter table rate_limit_hits enable row level security;

-- No policy for anyone. Only the service role touches this table, and the
-- service role is not subject to row level security. An attacker who could
-- read or write it could either clear their own count or fabricate someone
-- else's, which would turn the limiter into a way to lock a real user out.
revoke all on rate_limit_hits from anon, authenticated;

/**
 * Count the hits and record this one, in a single round trip.
 *
 * Returns the number of hits INCLUDING this one, so the caller allows the
 * request when the result is at or under its limit. Counting and inserting
 * separately leaves a window where two simultaneous requests both see the old
 * count, which is exactly what a script produces.
 */
create or replace function rate_limit_touch(
  p_bucket text,
  p_subject text,
  p_window_seconds int
) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into rate_limit_hits (bucket, subject) values (p_bucket, p_subject);

  select count(*) into n from rate_limit_hits
   where bucket = p_bucket
     and subject = p_subject
     and created_at > now() - make_interval(secs => p_window_seconds);

  return n;
end $$;

-- Old rows are noise. Anything past a day cannot affect any window we use.
create or replace function rate_limit_sweep() returns void
language sql security definer set search_path = public as $$
  delete from rate_limit_hits where created_at < now() - interval '1 day';
$$;

grant execute on function rate_limit_touch(text, text, int) to service_role;
grant execute on function rate_limit_sweep() to service_role;

comment on table rate_limit_hits is
  'Service role only. One row per request against a limited endpoint, swept daily by rate_limit_sweep().';

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'rate_limit_touch') then
    raise exception '0061 did not take: rate_limit_touch() was not created.';
  end if;
  raise notice '0061 applied. Public endpoints can now be rate limited across instances.';
end $$;
