-- ============================================================
-- MYJOBHACK App — Migration 0001 · Layer 1 Foundation
-- Run in Supabase SQL Editor. Models the full engine:
-- profiles & roles · talent CRM axes · credentials/verification
-- organizations · jobs + custom application forms · trainings + LMS
-- subscriptions + payments (Paystack/manual/USD) · AI tool runs
-- Elite chapters · notifications · activity log
-- ============================================================

-- ---------- ENUMS ----------
create type user_role as enum ('job_seeker','elite_member','employer','recruiter','trainer','partner','admin');
create type verification_status as enum ('pending','in_review','verified','rejected');
create type doc_kind as enum ('resume','credential','avatar','jd','payment_proof','course_asset','other');
create type work_mode as enum ('remote','hybrid','onsite','flexible');
create type role_level as enum ('entry','junior','mid','senior','lead','executive');
create type relocation_pref as enum ('none','domestic','international');
create type job_status as enum ('draft','published','closed','archived');
create type employment_type as enum ('full_time','part_time','contract','internship','temporary');
create type application_status as enum ('submitted','rules_failed','shortlisted','interviewing','offered','hired','rejected','withdrawn');
create type field_type as enum ('text','textarea','number','select','multiselect','boolean','date','file');
create type training_delivery as enum ('external','lms');
create type training_status as enum ('draft','open','in_progress','completed','cancelled');
create type invite_status as enum ('queued','sent','failed');
create type enrollment_status as enum ('invited','registered','attended','completed','dropped');
create type sub_status as enum ('inactive','pending_confirmation','active','past_due','cancelled','expired');
create type pay_method as enum ('paystack','flutterwave','manual_transfer_ngn','manual_transfer_usd');
create type pay_status as enum ('initiated','pending_review','confirmed','failed','refunded');
create type ai_tool as enum ('resume_review','interview_prep','skills_gap');
create type lesson_type as enum ('video','text','file','quiz','link');
create type taxonomy_kind as enum ('niche','career_goal','expertise','sector');

-- ---------- CORE: PROFILES ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'job_seeker',
  full_name text not null default '',
  email text not null default '',
  phone text,
  country text,
  city text,
  avatar_url text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- TAXONOMIES (admin-manageable CRM axes) ----------
create table taxonomies (
  id uuid primary key default gen_random_uuid(),
  kind taxonomy_kind not null,
  label text not null,
  slug text not null,
  active boolean not null default true,
  sort int not null default 0,
  unique (kind, slug)
);

-- ---------- DOCUMENTS (all uploads; compressed sizes tracked) ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  kind doc_kind not null default 'other',
  bucket text not null default 'documents',
  path text not null,
  original_name text not null default '',
  mime text not null default '',
  size_bytes bigint not null default 0,
  original_size_bytes bigint,
  created_at timestamptz not null default now()
);

-- ---------- TALENT PROFILES (the four CRM axes) ----------
create table talent_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  niche_id uuid references taxonomies(id),
  career_goal_id uuid references taxonomies(id),
  headline text,
  summary text,
  years_experience int not null default 0,
  -- career expectation
  salary_min numeric,
  salary_max numeric,
  salary_currency text not null default 'NGN',
  expected_role_level role_level,
  preferred_work_mode work_mode,
  relocation relocation_pref not null default 'none',
  -- assets & status
  resume_document_id uuid references documents(id),
  profile_completion int not null default 0,
  verification verification_status not null default 'pending',
  updated_at timestamptz not null default now()
);

create table talent_expertise (
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade,
  taxonomy_id uuid not null references taxonomies(id) on delete cascade,
  primary key (talent_id, taxonomy_id)
);

-- ---------- CREDENTIALS & VERIFICATION ----------
create table credentials (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade,
  kind text not null default 'degree',
  institution text not null default '',
  title text not null default '',
  year int,
  distinction text,
  document_id uuid references documents(id),
  status verification_status not null default 'pending',
  reviewer_id uuid references profiles(id),
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- ORGANIZATIONS (employers) ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  sector_id uuid references taxonomies(id),
  country text,
  logo_document_id uuid references documents(id),
  verified boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  org_role text not null default 'member',
  primary key (org_id, profile_id)
);

-- ---------- APPLICATION FORM BUILDER ----------
create table application_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Application form',
  is_template boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references application_forms(id) on delete cascade,
  sort int not null default 0,
  label text not null,
  field_type field_type not null default 'text',
  options jsonb,               -- for select/multiselect: ["A","B"]
  required boolean not null default true,
  -- eligibility rule evaluated against the answer:
  -- e.g. {"op":">=","value":3} | {"op":"equals","value":true} | {"op":"in","value":["A","B"]}
  eligibility jsonb
);

-- ---------- JOBS ----------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete set null,   -- null = MYJOBHACK-posted
  title text not null,
  description text not null default '',
  location text,
  work_mode work_mode,
  role_level role_level,
  employment_type employment_type not null default 'full_time',
  salary_note text,
  niche_id uuid references taxonomies(id),
  form_id uuid references application_forms(id),
  jd_document_id uuid references documents(id),
  status job_status not null default 'draft',
  posted_by uuid references profiles(id),
  published_at timestamptz,
  closes_at timestamptz,
  external_url text,
  created_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade,
  status application_status not null default 'submitted',
  answers jsonb not null default '{}'::jsonb,     -- {field_id: value}
  resume_document_id uuid references documents(id),
  rules_passed boolean,
  ai_fit_score numeric,        -- 0-100 from CV scan vs JD
  ai_summary text,
  reviewed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (job_id, talent_id)
);

-- ---------- TRAININGS (external + LMS) ----------
create table trainings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  delivery training_delivery not null default 'external',
  status training_status not null default 'draft',
  trainer_id uuid references profiles(id),
  partner_org_id uuid references organizations(id),
  starts_at timestamptz,
  ends_at timestamptz,
  location_or_link text,
  capacity int,
  course_id uuid,              -- fk added after courses table
  niche_id uuid references taxonomies(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- one-button invite engine (audit trail of each blast)
create table invite_batches (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings(id) on delete cascade,
  filters jsonb not null default '{}'::jsonb,   -- the CRM segment used
  matched_count int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table training_invites (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references invite_batches(id) on delete set null,
  training_id uuid not null references trainings(id) on delete cascade,
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade,
  email text not null,
  status invite_status not null default 'queued',
  provider_message_id text,
  sent_at timestamptz,
  unique (training_id, talent_id)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings(id) on delete cascade,
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade,
  status enrollment_status not null default 'registered',
  attended_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (training_id, talent_id)
);

-- ---------- LMS ----------
create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  cover_document_id uuid references documents(id),
  status training_status not null default 'draft',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table trainings
  add constraint trainings_course_fk foreign key (course_id) references courses(id) on delete set null;

create table course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  sort int not null default 0,
  title text not null
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references course_modules(id) on delete cascade,
  sort int not null default 0,
  title text not null,
  lesson_type lesson_type not null default 'text',
  content jsonb not null default '{}'::jsonb,   -- {url}|{html}|{document_id}|{questions:[...]}
  duration_min int
);

create table lesson_progress (
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (talent_id, lesson_id)
);

create table certificates (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade,
  course_id uuid references courses(id),
  training_id uuid references trainings(id),
  serial text not null unique,
  issued_at timestamptz not null default now(),
  document_id uuid references documents(id)
);

-- ---------- SUBSCRIPTIONS & PAYMENTS ----------
create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_ngn numeric not null default 0,
  price_usd numeric not null default 0,
  interval text not null default 'monthly',
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status sub_status not null default 'inactive',
  method pay_method,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id) on delete set null,
  profile_id uuid not null references profiles(id) on delete cascade,
  amount numeric not null,
  currency text not null default 'NGN',
  method pay_method not null,
  provider_ref text,
  proof_document_id uuid references documents(id),
  status pay_status not null default 'initiated',
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- AI TOOL RUNS (usage log; gated by active subscription) ----------
create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  tool ai_tool not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  model text,
  tokens_in int,
  tokens_out int,
  created_at timestamptz not null default now()
);

-- ---------- ELITE ----------
create table chapters (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  country text not null,
  active boolean not null default true,
  unique (city, country)
);

create table elite_memberships (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade unique,
  chapter_id uuid references chapters(id),
  status verification_status not null default 'pending',
  member_no serial,
  distinction text,
  verified_at timestamptz,
  reviewer_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- NOTIFICATIONS & ACTIVITY ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

-- ---------- INDEXES ----------
create index idx_talent_niche on talent_profiles(niche_id);
create index idx_talent_goal on talent_profiles(career_goal_id);
create index idx_talent_level on talent_profiles(expected_role_level);
create index idx_talent_mode on talent_profiles(preferred_work_mode);
create index idx_expertise_tax on talent_expertise(taxonomy_id);
create index idx_jobs_status on jobs(status);
create index idx_apps_job on applications(job_id);
create index idx_apps_talent on applications(talent_id);
create index idx_invites_training on training_invites(training_id);
create index idx_notif_profile on notifications(profile_id, read);
create index idx_activity_created on activity_log(created_at desc);
create index idx_payments_status on payments(status);

-- ---------- HELPERS ----------
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()) = 'admin', false)
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()) in ('admin','recruiter'), false)
$$;

create or replace function has_active_subscription(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subscriptions
    where profile_id = p and status = 'active'
      and (current_period_end is null or current_period_end > now())
  )
$$;

-- new auth user -> profile row (role from signup metadata, default job_seeker)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'job_seeker')
  );
  if coalesce((new.raw_user_meta_data->>'role')::user_role, 'job_seeker') in ('job_seeker','elite_member') then
    insert into talent_profiles (profile_id) values (new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger talent_touch before update on talent_profiles
  for each row execute function touch_updated_at();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table taxonomies enable row level security;
alter table documents enable row level security;
alter table talent_profiles enable row level security;
alter table talent_expertise enable row level security;
alter table credentials enable row level security;
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table application_forms enable row level security;
alter table form_fields enable row level security;
alter table jobs enable row level security;
alter table applications enable row level security;
alter table trainings enable row level security;
alter table invite_batches enable row level security;
alter table training_invites enable row level security;
alter table enrollments enable row level security;
alter table courses enable row level security;
alter table course_modules enable row level security;
alter table lessons enable row level security;
alter table lesson_progress enable row level security;
alter table certificates enable row level security;
alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table ai_runs enable row level security;
alter table chapters enable row level security;
alter table elite_memberships enable row level security;
alter table notifications enable row level security;
alter table activity_log enable row level security;
alter table app_settings enable row level security;

-- profiles
create policy "own profile read" on profiles for select using (id = auth.uid() or is_staff());
create policy "own profile update" on profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy "admin profiles all" on profiles for all using (is_admin());

-- taxonomies: readable by all authed; admin writes
create policy "tax read" on taxonomies for select using (auth.uid() is not null);
create policy "tax admin write" on taxonomies for all using (is_admin());

-- documents: owner + staff
create policy "doc own" on documents for select using (owner_id = auth.uid() or is_staff());
create policy "doc insert own" on documents for insert with check (owner_id = auth.uid());
create policy "doc delete own" on documents for delete using (owner_id = auth.uid() or is_admin());

-- talent profiles: self + staff read; self update
create policy "talent self read" on talent_profiles for select using (profile_id = auth.uid() or is_staff());
create policy "talent self update" on talent_profiles for update using (profile_id = auth.uid());
create policy "talent staff update" on talent_profiles for update using (is_staff());
create policy "expertise self" on talent_expertise for all using (talent_id = auth.uid() or is_staff());

-- credentials: self manage; staff review
create policy "cred self" on credentials for select using (talent_id = auth.uid() or is_staff());
create policy "cred self insert" on credentials for insert with check (talent_id = auth.uid());
create policy "cred self update pending" on credentials for update using (talent_id = auth.uid() and status = 'pending');
create policy "cred staff" on credentials for update using (is_staff());

-- organizations & members
create policy "org read" on organizations for select using (auth.uid() is not null);
create policy "org admin write" on organizations for all using (is_staff());
create policy "org member self" on org_members for select using (profile_id = auth.uid() or is_staff());
create policy "org member admin" on org_members for all using (is_admin());

-- forms & fields: staff + org members of the job's org (simplified L1: staff manage)
create policy "forms staff" on application_forms for all using (is_staff());
create policy "forms read authed" on application_forms for select using (auth.uid() is not null);
create policy "fields staff" on form_fields for all using (is_staff());
create policy "fields read authed" on form_fields for select using (auth.uid() is not null);

-- jobs: published readable by authed; staff manage; org members manage own
create policy "jobs read published" on jobs for select using (status = 'published' or is_staff() or (org_id in (select org_id from org_members where profile_id = auth.uid())));
create policy "jobs staff write" on jobs for all using (is_staff());
create policy "jobs org write" on jobs for all using (org_id in (select org_id from org_members where profile_id = auth.uid()));

-- applications: talent own; job owners read
create policy "apps talent" on applications for select using (talent_id = auth.uid() or is_staff() or job_id in (select id from jobs where org_id in (select org_id from org_members where profile_id = auth.uid())));
create policy "apps talent insert" on applications for insert with check (talent_id = auth.uid());
create policy "apps talent withdraw" on applications for update using (talent_id = auth.uid());
create policy "apps staff update" on applications for update using (is_staff());

-- trainings: open/published visible; staff/trainer manage
create policy "trainings read" on trainings for select using (status in ('open','in_progress','completed') or is_staff() or trainer_id = auth.uid());
create policy "trainings staff" on trainings for all using (is_staff());
create policy "trainings trainer update" on trainings for update using (trainer_id = auth.uid());

create policy "batches staff" on invite_batches for all using (is_staff());
create policy "invites self read" on training_invites for select using (talent_id = auth.uid() or is_staff());
create policy "invites staff write" on training_invites for all using (is_staff());

create policy "enroll self" on enrollments for select using (talent_id = auth.uid() or is_staff() or training_id in (select id from trainings where trainer_id = auth.uid()));
create policy "enroll self insert" on enrollments for insert with check (talent_id = auth.uid());
create policy "enroll staff" on enrollments for update using (is_staff() or training_id in (select id from trainings where trainer_id = auth.uid()));

-- LMS: published courses readable; staff/trainer author
create policy "courses read" on courses for select using (status in ('open','in_progress','completed') or is_staff() or created_by = auth.uid());
create policy "courses staff" on courses for all using (is_staff() or created_by = auth.uid());
create policy "modules read" on course_modules for select using (auth.uid() is not null);
create policy "modules staff" on course_modules for all using (is_staff());
create policy "lessons read" on lessons for select using (auth.uid() is not null);
create policy "lessons staff" on lessons for all using (is_staff());
create policy "progress self" on lesson_progress for all using (talent_id = auth.uid() or is_staff());
create policy "certs self" on certificates for select using (talent_id = auth.uid() or is_staff());
create policy "certs staff" on certificates for all using (is_staff());

-- plans/subscriptions/payments
create policy "plans read" on plans for select using (true);
create policy "plans admin" on plans for all using (is_admin());
create policy "subs self" on subscriptions for select using (profile_id = auth.uid() or is_admin());
create policy "subs admin" on subscriptions for all using (is_admin());
create policy "pay self" on payments for select using (profile_id = auth.uid() or is_admin());
create policy "pay self insert" on payments for insert with check (profile_id = auth.uid());
create policy "pay admin" on payments for update using (is_admin());

-- ai runs: self
create policy "ai self" on ai_runs for select using (profile_id = auth.uid() or is_admin());
create policy "ai self insert" on ai_runs for insert with check (profile_id = auth.uid());

-- elite
create policy "chapters read" on chapters for select using (true);
create policy "chapters admin" on chapters for all using (is_admin());
create policy "elite self" on elite_memberships for select using (talent_id = auth.uid() or is_staff());
create policy "elite self insert" on elite_memberships for insert with check (talent_id = auth.uid());
create policy "elite staff" on elite_memberships for update using (is_staff());

-- notifications & activity
create policy "notif self" on notifications for select using (profile_id = auth.uid());
create policy "notif self update" on notifications for update using (profile_id = auth.uid());
create policy "notif staff insert" on notifications for insert with check (is_staff() or profile_id = auth.uid());
create policy "activity staff" on activity_log for select using (is_staff());
create policy "activity insert" on activity_log for insert with check (auth.uid() is not null);
create policy "settings admin" on app_settings for all using (is_admin());
create policy "settings read" on app_settings for select using (auth.uid() is not null);

-- ---------- STORAGE ----------
insert into storage.buckets (id, name, public) values
  ('documents','documents', false),
  ('avatars','avatars', true),
  ('course-assets','course-assets', false)
on conflict (id) do nothing;

create policy "docs bucket own read" on storage.objects for select
  using (bucket_id = 'documents' and (owner = auth.uid() or is_staff()));
create policy "docs bucket own write" on storage.objects for insert
  with check (bucket_id = 'documents' and owner = auth.uid());
create policy "docs bucket own delete" on storage.objects for delete
  using (bucket_id = 'documents' and (owner = auth.uid() or is_admin()));
create policy "avatars public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars own write" on storage.objects for insert
  with check (bucket_id = 'avatars' and owner = auth.uid());
create policy "course assets read" on storage.objects for select
  using (bucket_id = 'course-assets' and auth.uid() is not null);
create policy "course assets staff write" on storage.objects for insert
  with check (bucket_id = 'course-assets' and is_staff());

-- ---------- SEED ----------
insert into plans (name, price_ngn, price_usd, interval, features) values
  ('AI Career Toolkit', 5000, 10, 'monthly',
   '["AI Resume Review","Interview Preparer","Skills Gap Analysis","Future AI tools included"]'::jsonb);

insert into chapters (city, country) values
  ('Lagos','Nigeria'), ('Abuja','Nigeria'), ('Accra','Ghana'),
  ('Nairobi','Kenya'), ('Johannesburg','South Africa'), ('Cairo','Egypt'),
  ('Kigali','Rwanda'), ('Addis Ababa','Ethiopia');

insert into taxonomies (kind, label, slug, sort) values
  ('niche','Software & Data','software-data',1),
  ('niche','Finance & Accounting','finance-accounting',2),
  ('niche','Sales & Marketing','sales-marketing',3),
  ('niche','Human Resources','human-resources',4),
  ('niche','Operations & Admin','operations-admin',5),
  ('niche','Engineering (Non-IT)','engineering',6),
  ('niche','Healthcare','healthcare',7),
  ('niche','Legal','legal',8),
  ('career_goal','Land my first role','first-role',1),
  ('career_goal','Switch career path','switch-path',2),
  ('career_goal','Grow to senior level','grow-senior',3),
  ('career_goal','Move into leadership','leadership',4),
  ('career_goal','Work internationally','international',5),
  ('career_goal','Freelance / contract work','freelance',6),
  ('sector','Banking','banking',1),
  ('sector','Fintech','fintech',2),
  ('sector','Telecoms','telecoms',3),
  ('sector','Energy','energy',4),
  ('sector','FMCG','fmcg',5),
  ('sector','Consulting','consulting',6),
  ('expertise','Data Analysis','data-analysis',1),
  ('expertise','Accounting','accounting',2),
  ('expertise','Digital Marketing','digital-marketing',3),
  ('expertise','Project Management','project-management',4),
  ('expertise','Customer Success','customer-success',5),
  ('expertise','Software Development','software-development',6),
  ('expertise','UI/UX Design','ui-ux',7),
  ('expertise','Human Resources','hr',8);

insert into app_settings (key, value) values
  ('bank_transfer_ngn', '{"bank":"Wema Bank","account_name":"Myjobhack","account_number":"SET_ME"}'::jsonb),
  ('bank_transfer_usd', '{"bank":"SET_ME","account_name":"SET_ME","account_number":"SET_ME","note":"Domiciliary account"}'::jsonb);

-- ============================================================
-- POST-INSTALL (manual):
-- 1) Create your admin: sign up in the app, then run:
--    update profiles set role='admin' where email='you@myjobhack.co';
-- 2) Update bank details in app_settings.
-- ============================================================
