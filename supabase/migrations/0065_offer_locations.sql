-- ============================================================
-- 0065 · Offer letters carry the location they were issued for.
--
-- Run after 0064. Safe to run more than once.
--
-- WHY. The same call centre role is offered at several sites, and there was
-- no way to answer "how many have we offered in Ikeja". A free text column
-- would turn "Ikeja", "ikeja" and "IKEJA " into three places, and the counts
-- would look right while being wrong. So an offer points at a row in a list,
-- and the list refuses a second spelling of a name it already holds.
--
-- WHY NOT jobs.locations. A job's locations are {country, state} pairs, at
-- state level ("Lagos, Nigeria"). An offer goes to a site ("Ikeja"). The job's
-- locations are offered as suggestions in the form and become rows here the
-- first time one is picked, so both kinds end up in the same list.
--
-- BACKFILL: NONE, ON PURPOSE. Offers already sent keep location_id null and
-- show as "Not tagged". A location guessed from the letter body or the job
-- would be indistinguishable from one recorded at the time, and would quietly
-- corrupt the only number this exists to make trustworthy.
-- ============================================================

-- ---------- 0 · prerequisites ----------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'offer_letters'
                    and column_name = 'expires_at') then
    raise exception '0065 needs migration 0060. Run the migrations in order, then try again.';
  end if;
end $$;

-- ---------- 1 · the list ----------
create table if not exists offer_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint offer_locations_name_not_blank check (length(btrim(name)) > 0)
);

-- One row per place, whatever the case or stray spaces. This is the rule that
-- keeps the counts honest; the application normalises too, but the database
-- is what makes a second spelling impossible.
create unique index if not exists offer_locations_name_key
  on offer_locations (lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));

alter table offer_locations enable row level security;

-- Staff only, the same reach as offer_letters. The list itself is not
-- sensitive, but there is no reason for anyone else to read or write it.
drop policy if exists "offer_locations staff" on offer_locations;
create policy "offer_locations staff" on offer_locations
  for all using (is_staff()) with check (is_staff());

comment on table offer_locations is
  'Places an offer can be issued for. Picked from, never typed into an offer, so one place has one spelling.';

-- ---------- 2 · the column on the offer ----------
alter table offer_letters
  add column if not exists location_id uuid references offer_locations(id) on delete restrict;

-- on delete restrict: removing a location that offers point at would silently
-- move them to "Not tagged" and change history. It has to be merged or the
-- offers retagged first.

create index if not exists offer_letters_location_idx on offer_letters (location_id);

comment on column offer_letters.location_id is
  'Where this offer was issued for. Null means not tagged; offers sent before 0065 are left null rather than guessed.';

-- ---------- 3 · counts per location ----------
-- security_invoker so a signed in reader sees only what offer_letters' own
-- policy lets them see. The page reads it with the service role after its own
-- capability check, which is the same arrangement as the offer list itself.
--
-- "expired" is not a status: an offer past its deadline with no answer still
-- reads status 'sent'. It is counted from expires_at, the same rule the
-- signing page uses to refuse the link.
create or replace view offer_location_summary
with (security_invoker = true) as
select
  o.location_id,
  l.name as location_name,
  count(*) filter (where o.status <> 'draft')                                     as sent,
  count(*) filter (where o.status = 'accepted')                                   as accepted,
  count(*) filter (where o.status = 'declined')                                   as declined,
  count(*) filter (where o.status = 'withdrawn')                                  as withdrawn,
  count(*) filter (where o.status = 'sent' and o.expires_at is not null
                     and o.expires_at < now())                                    as expired,
  count(*) filter (where o.status = 'sent' and (o.expires_at is null
                     or o.expires_at >= now()))                                   as awaiting
from offer_letters o
left join offer_locations l on l.id = o.location_id
group by o.location_id, l.name;

comment on view offer_location_summary is
  'Offers per location by outcome. location_id null is the "Not tagged" row.';

-- ---------- prove it landed ----------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'offer_letters'
                    and column_name = 'location_id') then
    raise exception '0065 did not take: offer_letters has no location_id.';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'offer_locations_name_key') then
    raise exception '0065 did not take: offer_locations has no unique name rule, so the same place could be entered twice.';
  end if;
  if not exists (select 1 from pg_policies
                  where tablename = 'offer_locations' and policyname = 'offer_locations staff') then
    raise exception '0065 did not take: offer_locations has no policy.';
  end if;
  raise notice '0065 applied. Offers can be tagged to a location, each place has one spelling, and offers sent before today show as Not tagged.';
end $$;
