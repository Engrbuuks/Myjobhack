-- 0055 · Offer letters on company letterhead, signed and countersigned.
--
-- Three things this has to get right, because an offer letter is a document
-- someone may rely on legally:
--
--   1. It must look like the company's own letter, not the platform's. The
--      letterhead is uploaded once and used as the page background.
--   2. It must carry a real signature from whoever is making the offer, in
--      the same place every time.
--   3. The candidate must be able to sign and return it. An offer nobody
--      countersigned is an offer nobody accepted, and that distinction
--      matters months later when someone disputes what was agreed.

create table if not exists letterheads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,

  -- Stored in R2 or Supabase storage, same as résumés.
  file_path text not null,
  file_bucket text,
  file_provider text not null default 'r2',
  /* pdf uses the first page as the background; an image is drawn full width. */
  file_kind text not null default 'pdf',

  /* Where the letterhead's own artwork ends and text may begin, in points
     from the top and bottom of an A4 page. Without this the body runs over
     a printed logo or a footer. */
  top_margin_pt int not null default 150,
  bottom_margin_pt int not null default 110,

  -- The signature that appears above the signatory's name.
  signature_path text,
  signature_bucket text,
  signature_provider text default 'r2',
  signatory_name text default '',
  signatory_title text default '',

  is_default boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists letterheads_org_idx on letterheads(org_id);

create table if not exists offer_letters (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  letterhead_id uuid references letterheads(id) on delete set null,

  -- Snapshot of who it went to. The application may change afterwards; what
  -- the letter said and who received it must not.
  candidate_name text not null,
  candidate_email text not null,

  -- The rendered body, kept verbatim. Regenerating from a template later
  -- would not reproduce what the person was actually sent.
  body text not null,
  position_title text default '',
  salary text default '',
  start_date date,
  reporting_to text default '',

  pdf_path text,
  pdf_bucket text,
  pdf_provider text default 'r2',

  cc_emails text[] not null default '{}',

  status text not null default 'draft',   -- draft | sent | accepted | declined | withdrawn
  sent_at timestamptz,
  sent_by uuid references profiles(id),

  -- Countersigning.
  sign_token text unique,
  signed_at timestamptz,
  signed_name text,
  signed_ip text,
  declined_at timestamptz,
  decline_reason text,

  created_at timestamptz not null default now()
);

create index if not exists offer_letters_token_idx on offer_letters(sign_token);
create index if not exists offer_letters_app_idx on offer_letters(application_id);
create index if not exists offer_letters_status_idx on offer_letters(status);

alter table letterheads enable row level security;
alter table offer_letters enable row level security;

drop policy if exists "letterheads staff" on letterheads;
create policy "letterheads staff" on letterheads
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','recruiter'))
  );

drop policy if exists "offer_letters staff" on offer_letters;
create policy "offer_letters staff" on offer_letters
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','recruiter'))
  );

-- The candidate signs through a tokenised public page served by the service
-- role, so no anonymous policy is granted here. A readable table would expose
-- every candidate's salary.

comment on table offer_letters is
  'One row per offer sent. Body and recipient are snapshots: what was sent must remain reconstructable even if the application or template changes.';
comment on column offer_letters.sign_token is
  'Single use credential in the countersigning link. Grants signing of this one offer and nothing else.';
