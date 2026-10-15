-- ============================================================
-- 0060 · Guest hires can be billed, and an offer link stops being eternal.
--
-- Run after 0058 and 0059. Safe to run more than once.
--
-- TWO UNRELATED GAPS THAT BOTH NEEDED A COLUMN:
--
-- 1 · Most applicants on this platform never register, so their application
--     carries a guest name and email and no talent_id. placements.talent_id
--     was NOT NULL and referenced profiles, so hiring a guest could not
--     produce a placement row at all: no fee, no invoice, no retention check
--     ins. The fee is owed whether or not the candidate made an account.
--
-- 2 · An offer letter's signing token had no expiry and no way to withdraw it.
--     A link forwarded to a colleague, or sitting in an old mailbox, could be
--     used to accept an offer months later, in any name, because the typed
--     name was never compared to the candidate's.
-- ============================================================

-- ---------- 1 · placements for candidates with no profile ----------
alter table placements alter column talent_id drop not null;

alter table placements
  add column if not exists guest_name text,
  add column if not exists guest_email text;

-- A placement is for exactly one person: either a registered candidate or a
-- named guest. Without this a row with neither could be created, which is a
-- fee owed by nobody.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'placements_has_a_person') then
    alter table placements add constraint placements_has_a_person
      check (talent_id is not null or guest_email is not null);
  end if;
end $$;

comment on column placements.guest_email is
  'Set when the hire never registered. talent_id is null in that case, and the fee is still owed.';

-- The retention check in trigger keys off the placement id alone, so guest
-- placements get their 30, 60 and 90 day check ins like any other.

-- ---------- 2 · offer letters expire and can be withdrawn ----------
alter table offer_letters
  add column if not exists expires_at timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by uuid references profiles(id);

-- Offers already sent get a deadline rather than none. Fourteen days from the
-- send date matches how long these are left open in practice, and an offer
-- already accepted or declined is left alone because its link is spent.
update offer_letters
   set expires_at = coalesce(sent_at, created_at) + interval '14 days'
 where expires_at is null
   and signed_at is null
   and declined_at is null;

create index if not exists offer_letters_open_idx
  on offer_letters (expires_at)
  where signed_at is null and declined_at is null and withdrawn_at is null;

comment on column offer_letters.expires_at is
  'After this, the signing link is refused. A new offer must be issued rather than the old link reused.';
comment on column offer_letters.withdrawn_at is
  'Set when staff withdraw an offer. The signing link is refused from that moment.';

-- ---------- prove it landed ----------
do $$
begin
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'placements'
         and column_name = 'talent_id') <> 'YES' then
    raise exception '0060 did not take: placements.talent_id is still mandatory, so guest hires cannot be billed.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'offer_letters'
                    and column_name = 'expires_at') then
    raise exception '0060 did not take: offer_letters has no expires_at.';
  end if;
  raise notice '0060 applied. Guest hires can now raise a placement and a fee, and open offer links expire fourteen days after they were sent.';
end $$;
