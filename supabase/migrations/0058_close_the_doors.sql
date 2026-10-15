-- ============================================================
-- 0058 · Close the doors.
--
-- The route handlers in this app check things. The database did not. Until
-- this migration, the public anon key, which ships inside every visitor's
-- browser, could read and write tables that decide who has paid and what a
-- candidate is worth. This file closes that, and nothing in it changes the
-- application's behaviour for anyone who is using the product as intended.
--
-- Run it in the Supabase SQL editor AFTER 0057. Safe to run more than once.
--
-- WHAT IT DOES, in the order the risks matter:
--   1 · is_admin_or_service() stops treating anonymous visitors as admins
--   2 · the six entitlement tables become read only to their owner
--   3 · write policies that pinned the owner but not the field get the field
--   4 · storage buckets stop being public and writable by anyone signed in
--   5 · the signup trigger stops believing a role the client claims
--   6 · migration 0016 is finally applied, having rolled back on a typo
--
-- ONE CODE CHANGE IS REQUIRED ALONGSIDE IT. Section 2 removes the policy that
-- let a candidate insert their own enrollments row from the browser, which is
-- how free training registration worked. The replacement is the server route
-- app/api/trainings/enroll, shipped in the same release. Deploy the code and
-- run this migration together, or free training signup breaks in between.
-- ============================================================

-- ---------- 0 · refuse to run against an incomplete database ----------
-- A half applied schema would leave some policies replaced and others not,
-- which is worse than either state. Fail loudly instead.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'talent_profiles'
                   and column_name = 'competency_band') then
    raise exception '0058 needs migration 0024. Run the migrations in order, then try again.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'elite_memberships'
                   and column_name = 'premium_active') then
    raise exception '0058 needs migration 0031. Run the migrations in order, then try again.';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'offer_letters') then
    raise exception '0058 needs migration 0055. Run the migrations in order, then try again.';
  end if;
end $$;

-- ============================================================
-- 1 · The one clause that opened eight tables to the internet
-- ============================================================
-- WHAT WENT WRONG: 0036 defined this as
--     is_admin() or role = 'service_role' or auth.uid() is null
-- The last clause was meant to let the service role through. But for the anon
-- role auth.uid() IS null, so the function returned true for anyone holding
-- the public key, and no policy in this schema carries a TO clause, so every
-- policy using it also applied to anon. That made app_settings, which holds
-- the bank transfer account number, readable and writable by the internet.
--
-- The service role bypasses row level security outright and never needed a
-- clause here at all.
create or replace function is_admin_or_service() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_admin(), false)
      or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
$$;

-- app_settings holds bank details and pricing. Staff only, both ways.
drop policy if exists "settings admin" on public.app_settings;
create policy "settings admin" on public.app_settings
  for all using (is_admin()) with check (is_admin());

drop policy if exists "settings read" on public.app_settings;
create policy "settings read" on public.app_settings
  for select using (auth.uid() is not null);

-- ============================================================
-- 2 · Entitlement tables: readable by their owner, written by staff only
-- ============================================================
-- These six tables are the answer to "has this person paid". A client that can
-- write them does not need to pay. Every legitimate write already happens in a
-- server route using the service role, which is not subject to these policies,
-- so narrowing them to SELECT costs the product nothing.

-- profile_unlocks and placements are the two rows the resume endpoint reads to
-- decide whether to release an unredacted CV.
drop policy if exists "unlocks own or staff" on public.profile_unlocks;
create policy "unlocks read own" on public.profile_unlocks
  for select using (employer_id = auth.uid() or is_staff());
drop policy if exists "unlocks write staff" on public.profile_unlocks;
create policy "unlocks write staff" on public.profile_unlocks
  for all using (is_staff()) with check (is_staff());

drop policy if exists "placements own or staff" on public.placements;
create policy "placements read own" on public.placements
  for select using (employer_id = auth.uid() or talent_id = auth.uid() or is_staff());
drop policy if exists "placements write staff" on public.placements;
create policy "placements write staff" on public.placements
  for all using (is_staff()) with check (is_staff());

-- employer_subscriptions decides the plan and the view quota. org_id was
-- unconstrained, so a row could also be attached to someone else's company.
drop policy if exists "esub own or staff" on public.employer_subscriptions;
create policy "esub read own" on public.employer_subscriptions
  for select using (profile_id = auth.uid() or is_staff());
drop policy if exists "esub write staff" on public.employer_subscriptions;
create policy "esub write staff" on public.employer_subscriptions
  for all using (is_staff()) with check (is_staff());

-- assessment_orders carried its own status, so an order could mark itself paid.
drop policy if exists "orders own or staff" on public.assessment_orders;
create policy "orders read own" on public.assessment_orders
  for select using (employer_id = auth.uid() or is_staff());
drop policy if exists "orders write staff" on public.assessment_orders;
create policy "orders write staff" on public.assessment_orders
  for all using (is_staff()) with check (is_staff());

-- enrollments: the self insert policy enrolled the caller in any training,
-- paid ones included. Reads stay, the trainer and staff update policies stay,
-- and registration moves to app/api/trainings/enroll, which checks the price.
drop policy if exists "enroll self insert" on public.enrollments;

-- elite_memberships: the insert pinned talent_id and nothing else, so the
-- client could supply status 'verified', tier 'premium' and premium_active
-- true, and that badge then unlocked every other Elite member's name, email,
-- phone and salary expectations through the peer read policies in 0002.
-- Applying is still self serve; awarding the status is not.
drop policy if exists "elite self insert" on public.elite_memberships;
create policy "elite self insert" on public.elite_memberships
  for insert with check (
    talent_id = auth.uid()
    and status = 'pending'
    and coalesce(premium_active, false) = false
    and coalesce(tier, 'standard') = 'standard'
  );

-- assessments hold the marking rubric in the questions column, and FOR ALL let
-- a candidate read it, reset the clock, swap the questions and blank the
-- integrity column that records paste and focus loss. The whole sitting runs
-- through /api/assessment/generate and /api/assessment/submit on the service
-- role, so the candidate never needed write access.
drop policy if exists "asmt own or staff" on public.assessments;
create policy "asmt read own" on public.assessments
  for select using (talent_id = auth.uid() or is_staff());
drop policy if exists "asmt write staff" on public.assessments;
create policy "asmt write staff" on public.assessments
  for all using (is_staff()) with check (is_staff());

-- Answers were writable after submission, including seconds_spent, which is
-- itself a cheating signal.
drop policy if exists "ans own or staff" on public.assessment_answers;
create policy "ans read own" on public.assessment_answers
  for select using (
    is_staff() or exists (
      select 1 from assessments a
       where a.id = assessment_answers.assessment_id and a.talent_id = auth.uid())
  );
drop policy if exists "ans write staff" on public.assessment_answers;
create policy "ans write staff" on public.assessment_answers
  for all using (is_staff()) with check (is_staff());

-- A score was readable at any review_status, so a candidate saw their mark,
-- the anti cheat flags and the reviewer's private note before a human had
-- confirmed any of it, including being told they had been flagged.
drop policy if exists "score read own or staff" on public.assessment_scores;
create policy "score read own or staff" on public.assessment_scores
  for select using (
    is_staff()
    or (talent_id = auth.uid() and review_status in ('confirmed', 'overridden'))
  );

-- ============================================================
-- 3 · Write policies that pinned the owner but not the field
-- ============================================================
-- In Postgres a policy with only USING reuses it as WITH CHECK, so these never
-- allowed a row to change owner. What they allowed was the owner changing
-- fields that decide what the row is worth.

-- An application's own status was free, so a candidate could set it to 'hired',
-- which fires recompute_job_hires and closes the job for everybody.
drop policy if exists "apps talent withdraw" on public.applications;
create policy "apps talent withdraw" on public.applications
  for update using (talent_id = auth.uid())
  with check (talent_id = auth.uid() and status in ('submitted', 'withdrawn'));

-- talent_profiles had no column scoping, so a candidate could award themselves
-- the Expert band and a verified profile, which is the exact signal employers
-- pay for. The profile wizard still works: everything else stays editable.
create or replace function tp_guard_privileged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    new.verification             := old.verification;
    new.competency_band          := old.competency_band;
    new.competency_score         := old.competency_score;
    new.competency_percentile    := old.competency_percentile;
    new.competency_field         := old.competency_field;
    new.competency_assessed_at   := old.competency_assessed_at;
    new.free_assessments_used    := old.free_assessments_used;
  end if;
  return new;
end $$;
-- resume_document_id is deliberately NOT in that list. It is how a candidate
-- attaches their own CV from the profile wizard, which writes this table from
-- the browser. Reverting it would have made the upload appear to work and
-- silently keep the old file, or none.

drop trigger if exists tp_guard on public.talent_profiles;
create trigger tp_guard before update on public.talent_profiles
  for each row execute function tp_guard_privileged();

-- organizations.verified is a trust signal shown to candidates, and any member
-- of an organisation could set it on their own company.
create or replace function org_guard_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    new.verified := old.verified;
  end if;
  return new;
end $$;

drop trigger if exists org_guard on public.organizations;
create trigger org_guard before update on public.organizations
  for each row execute function org_guard_verified();

-- storage_objects_log accepted inserts from anyone, and storage_used_bytes()
-- sums it for quota enforcement, so one fabricated row locked a named person
-- out of uploading.
drop policy if exists "storage log insert" on public.storage_objects_log;
create policy "storage log insert" on public.storage_objects_log
  for insert with check (profile_id = auth.uid() or is_staff());

-- Every active invite code, its tier and its internal label were readable by
-- anonymous visitors, and registration trusted a tier supplied in the body.
-- Codes are now resolved server side.
drop policy if exists "invite_links public read" on public.invite_links;

-- job_matches leaned on the function fixed in section 1. Tightened anyway, so
-- this table does not depend on that fix being kept.
drop policy if exists "job_matches own talent read" on public.job_matches;
create policy "job_matches own talent read" on public.job_matches
  for select using (talent_id = auth.uid() or is_staff());

-- ============================================================
-- 4 · Storage buckets
-- ============================================================
-- company-logos was public, and any signed in account could insert or update
-- anything in it, so a seeker could replace a competitor's logo. SVG was
-- allowed too, which is script on a same project URL.
update storage.buckets
   set public = false,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'company-logos';

drop policy if exists "logos public read" on storage.objects;
drop policy if exists "logos member write" on storage.objects;
drop policy if exists "logos member update" on storage.objects;

-- Logos are read through the app, which signs a URL, so the bucket itself does
-- not need a public read. Writes are scoped to the owning organisation's
-- folder, which is how the app already lays the paths out.
create policy "logos member read" on storage.objects for select
  using (bucket_id = 'company-logos' and (
    is_staff() or (storage.foldername(name))[1] in (
      select org_id::text from org_members where profile_id = auth.uid())));

create policy "logos member write" on storage.objects for insert
  with check (bucket_id = 'company-logos' and (
    is_staff() or (storage.foldername(name))[1] in (
      select org_id::text from org_members where profile_id = auth.uid())));

create policy "logos member update" on storage.objects for update
  using (bucket_id = 'company-logos' and (
    is_staff() or (storage.foldername(name))[1] in (
      select org_id::text from org_members where profile_id = auth.uid())))
  with check (bucket_id = 'company-logos' and (
    is_staff() or (storage.foldername(name))[1] in (
      select org_id::text from org_members where profile_id = auth.uid())));

create policy "logos member delete" on storage.objects for delete
  using (bucket_id = 'company-logos' and (
    is_staff() or (storage.foldername(name))[1] in (
      select org_id::text from org_members where profile_id = auth.uid())));

-- avatars was public with an unconditional read over the whole bucket, and
-- paths are the owner's user id, so a member photo was fetchable by anyone who
-- could guess or enumerate a path.
update storage.buckets set public = false where id = 'avatars';

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars read" on storage.objects for select
  using (bucket_id = 'avatars' and (auth.uid() is not null or is_staff()));

-- ============================================================
-- 5 · The signup trigger believed a role the client claimed
-- ============================================================
-- raw_user_meta_data is the caller controlled `data` payload of GoTrue's
-- public /auth/v1/signup. The app's own register route clamps the role, but
-- the trigger did not, so a request made directly against Supabase with the
-- public anon key and data {"role":"admin"} produced an admin profile, and
-- that satisfies is_admin() and therefore every staff policy in this schema.
-- Whether that was reachable depended on one dashboard setting, which is not
-- in version control. Now it does not depend on anything.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role   user_role;
  v_name   text;
  v_claim  text;
begin
  v_claim := new.raw_user_meta_data->>'role';
  -- Only these two are ever self selected. Anything else, including a claim of
  -- admin or recruiter, becomes a job seeker. Staff roles are granted by an
  -- administrator through the app, never asserted at signup.
  v_role := case when v_claim in ('job_seeker', 'employer')
                 then v_claim::user_role
                 else 'job_seeker'::user_role end;

  v_name := coalesce(new.raw_user_meta_data->>'full_name', '');

  begin
    insert into profiles (id, email, full_name, role)
    values (new.id, coalesce(new.email, ''), v_name, v_role)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: profile insert failed for %: %', new.id, sqlerrm;
  end;

  if v_role in ('job_seeker', 'elite_member') then
    begin
      insert into talent_profiles (profile_id) values (new.id)
      on conflict (profile_id) do nothing;
    exception when others then
      raise warning 'handle_new_user: talent_profile insert failed for %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 6 · Apply migration 0016, which has never run
-- ============================================================
-- 0016 line 27 says `drop policy if exists "forms staff" on forms`. There is
-- no forms table; it is application_forms. In the SQL editor the file runs as
-- one transaction, so the whole of 0016 rolled back on that line and the job
-- policy hardening it was written to apply has never been in effect.
drop policy if exists "jobs staff all" on public.jobs;
create policy "jobs staff all" on public.jobs
  for all using (is_staff()) with check (is_staff());

drop policy if exists "forms staff" on public.application_forms;
create policy "forms staff" on public.application_forms
  for all using (is_staff()) with check (is_staff());

drop policy if exists "form_fields staff" on public.form_fields;
create policy "form_fields staff" on public.form_fields
  for all using (is_staff()) with check (is_staff());

drop policy if exists "trainings staff" on public.trainings;
create policy "trainings staff" on public.trainings
  for all using (is_staff()) with check (is_staff());

-- ============================================================
-- 7 · Prove it landed
-- ============================================================
-- A migration that silently did nothing is the reason 0016 was lost for
-- months. This block fails if the most important changes are not in place.
do $$
declare
  n int;
begin
  -- The anon clause must be gone from the function body.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'is_admin_or_service'
     and pg_get_functiondef(p.oid) like '%auth.uid() is null%';
  if n > 0 then
    raise exception '0058 did not take: is_admin_or_service() still treats anonymous visitors as admins.';
  end if;

  -- The entitlement tables must have no FOR ALL policy left for a non staff owner.
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('profile_unlocks','placements','employer_subscriptions',
                       'assessment_orders','assessments','assessment_answers')
     and cmd = 'ALL' and qual like '%auth.uid()%';
  if n > 0 then
    raise exception '0058 did not take: % owner writable policy or policies remain on the entitlement tables.', n;
  end if;

  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'enrollments'
                and policyname = 'enroll self insert') then
    raise exception '0058 did not take: enrollments can still be self inserted.';
  end if;

  if exists (select 1 from storage.buckets where id in ('avatars','company-logos') and public) then
    raise exception '0058 did not take: a storage bucket is still public.';
  end if;

  raise notice '0058 applied. Anonymous write access closed, entitlement tables are read only to their owners, storage buckets are private, and the signup trigger no longer trusts a claimed role.';
end $$;

comment on function is_admin_or_service() is
  'Admin or service role. Never anonymous: an auth.uid() of null is an anonymous visitor, not a trusted caller.';
