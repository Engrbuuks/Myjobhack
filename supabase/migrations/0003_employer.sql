-- ============================================================
-- MYJOBHACK App — Migration 0003 · Employer self-serve
-- Run in Supabase SQL Editor after 0002.
-- Lets employer accounts create their organization, manage their
-- own application forms, and run their own hiring desk.
-- ============================================================

-- employers can create their organization
create policy "org self create" on organizations
  for insert with check (created_by = auth.uid());

-- members can update their own organization
create policy "org member update" on organizations
  for update using (
    id in (select org_id from org_members where profile_id = auth.uid())
    or created_by = auth.uid()
  );

-- the creator can bootstrap themselves as the first member
create policy "org member bootstrap" on org_members
  for insert with check (
    profile_id = auth.uid()
    and org_id in (select id from organizations where created_by = auth.uid())
  );

-- employers manage application forms they created
create policy "forms own create" on application_forms
  for insert with check (created_by = auth.uid());
create policy "forms own manage" on application_forms
  for update using (created_by = auth.uid());
create policy "forms own delete" on application_forms
  for delete using (created_by = auth.uid());

-- and the fields on those forms
create policy "fields own manage" on form_fields
  for all using (
    form_id in (select id from application_forms where created_by = auth.uid())
  ) with check (
    form_id in (select id from application_forms where created_by = auth.uid())
  );
