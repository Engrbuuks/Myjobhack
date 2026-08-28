-- 0047 · Fix résumé index upserts.
--
-- 0046 created PARTIAL unique indexes:
--
--   create unique index ... on resume_index(profile_id) where profile_id is not null;
--
-- Postgres will not use a partial unique index to resolve ON CONFLICT unless
-- the statement repeats the same WHERE predicate — and PostgREST's upsert
-- cannot express that, so every write failed with "there is no unique or
-- exclusion constraint matching the ON CONFLICT specification".
--
-- Plain unique CONSTRAINTS are what upsert needs, and they behave correctly
-- here anyway: Postgres treats NULLs as distinct in a unique index, so any
-- number of guest rows (profile_id null) and any number of pool rows
-- (application_id null) coexist without conflicting.

-- Safety: remove any duplicates before the constraints go on, keeping the
-- most recently indexed row. Should be a no-op, but a failed migration
-- halfway through a batch is worse than a redundant check.
delete from resume_index a
using resume_index b
where a.profile_id is not null
  and a.profile_id = b.profile_id
  and a.indexed_at < b.indexed_at;

delete from resume_index a
using resume_index b
where a.application_id is not null
  and a.application_id = b.application_id
  and a.indexed_at < b.indexed_at;

drop index if exists resume_index_profile_uniq;
drop index if exists resume_index_application_uniq;

alter table resume_index drop constraint if exists resume_index_profile_key;
alter table resume_index add constraint resume_index_profile_key unique (profile_id);

alter table resume_index drop constraint if exists resume_index_application_key;
alter table resume_index add constraint resume_index_application_key unique (application_id);
