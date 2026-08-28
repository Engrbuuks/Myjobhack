-- 0046 · Searchable résumé index for the whole talent pool.
--
-- THE PROBLEM THIS SOLVES: a client asks for someone who speaks Spanish. That
-- was never a field on any form, so it exists nowhere in structured data — but
-- it is sitting in dozens of CVs. Without this, answering that question means
-- opening CVs one at a time.
--
-- WHY A STORED TEXT INDEX RATHER THAN SCANNING ON DEMAND: extraction is the
-- expensive part (download the file, parse the PDF). Scanning per query means
-- paying that cost again for every new keyword, which makes ad-hoc search
-- unusable at pool scale. Extract once, store the text, and every future
-- search — Spanish today, forklift licence tomorrow — is a single indexed
-- query returning in milliseconds.

-- Needed by the trigram index below. Supabase ships it; this is a no-op if
-- it is already enabled.
create extension if not exists pg_trgm;

create table if not exists resume_index (
  id uuid primary key default gen_random_uuid(),

  -- Pool members. Null for a guest applicant with no account.
  profile_id uuid references profiles(id) on delete cascade,
  -- Guest applications, so people who applied without registering are findable.
  application_id uuid references applications(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,

  -- The extracted plain text of the CV.
  content text not null default '',
  content_chars int not null default 0,

  -- Postgres full-text vector, maintained by the database itself so it can
  -- never drift out of step with the content column.
  tsv tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,

  -- Extraction outcome, so unreadable CVs are visibly distinct from CVs with
  -- no match. A photographed CV has no text layer and never will.
  unreadable boolean not null default false,
  extract_error text,

  source_updated_at timestamptz,        -- when the underlying file was last seen
  indexed_at timestamptz not null default now()
);

-- One index row per person and per guest application.
--
-- These are CONSTRAINTS rather than partial unique indexes on purpose: ON
-- CONFLICT can only target a real constraint, and Postgres treats NULLs as
-- distinct in a unique index anyway — so many guest rows (profile_id null)
-- and many pool rows (application_id null) coexist happily.
alter table resume_index drop constraint if exists resume_index_profile_key;
alter table resume_index add constraint resume_index_profile_key unique (profile_id);
alter table resume_index drop constraint if exists resume_index_application_key;
alter table resume_index add constraint resume_index_application_key unique (application_id);

-- The index that makes pool-wide keyword search fast.
create index if not exists resume_index_tsv_idx on resume_index using gin(tsv);

-- Supports ILIKE fallback for terms full-text search handles poorly:
-- short tokens, product names, and anything with punctuation (C++, .NET).
create index if not exists resume_index_content_trgm_idx
  on resume_index using gin (content gin_trgm_ops);

create index if not exists resume_index_pending_idx on resume_index(indexed_at);

alter table resume_index enable row level security;

-- Staff only. CV text is the most sensitive data in the system — it carries
-- addresses, phone numbers and employment history in free form — so there is
-- deliberately no policy granting anyone else read access, not even the
-- candidate (who already has their own file).
drop policy if exists "resume_index staff" on resume_index;
create policy "resume_index staff" on resume_index
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role in ('admin','recruiter'))
  );

comment on table resume_index is
  'Extracted CV text for pool-wide keyword search. Written by /api/admin/index-resumes; read by /api/admin/search-resumes. Staff only.';
