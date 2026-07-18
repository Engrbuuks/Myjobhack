-- ============================================================
-- MYJOBHACK App — Migration 0007 · Elite community + Sales funnel
-- Run in Supabase SQL Editor after 0006.
-- ============================================================

-- ============ THE COMMONS (Elite forum) ============
create table forum_topics (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  category text not null default 'general',      -- general | opportunities | wins | ask
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create table forum_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references forum_topics(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index forum_replies_topic_idx on forum_replies(topic_id);

alter table forum_topics enable row level security;
alter table forum_replies enable row level security;

create policy "topics elite read" on forum_topics for select using (is_verified_elite() or is_staff());
create policy "topics elite write" on forum_topics for insert with check (is_verified_elite() and author_id = auth.uid());
create policy "topics own edit" on forum_topics for update using (author_id = auth.uid() or is_staff());
create policy "topics own delete" on forum_topics for delete using (author_id = auth.uid() or is_staff());
create policy "replies elite read" on forum_replies for select using (is_verified_elite() or is_staff());
create policy "replies elite write" on forum_replies for insert with check (is_verified_elite() and author_id = auth.uid());
create policy "replies own delete" on forum_replies for delete using (author_id = auth.uid() or is_staff());

-- ============ CONSENT-BASED DMs ============
create table dm_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending',        -- pending | accepted | declined
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);
create unique index dm_pair_uniq on dm_connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id));

create table dm_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references dm_connections(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index dm_messages_conn_idx on dm_messages(connection_id, created_at);

alter table dm_connections enable row level security;
alter table dm_messages enable row level security;

create policy "dm conn mine" on dm_connections for select
  using (requester_id = auth.uid() or recipient_id = auth.uid());
create policy "dm conn request" on dm_connections for insert
  with check (is_verified_elite() and requester_id = auth.uid());
create policy "dm conn respond" on dm_connections for update
  using (recipient_id = auth.uid());

create policy "dm msg mine" on dm_messages for select using (
  connection_id in (select id from dm_connections
    where requester_id = auth.uid() or recipient_id = auth.uid())
);
-- messages only flow through ACCEPTED connections — consent enforced at the database
create policy "dm msg send" on dm_messages for insert with check (
  sender_id = auth.uid()
  and connection_id in (select id from dm_connections
    where status = 'accepted' and (requester_id = auth.uid() or recipient_id = auth.uid()))
);

-- ============ SALES FUNNEL ============
create table funnel_emails (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  step text not null,
  sent_at timestamptz not null default now(),
  unique (profile_id, step)
);
alter table funnel_emails enable row level security;
create policy "funnel staff" on funnel_emails for all using (is_staff()) with check (is_staff());

insert into app_settings (key, value) values ('funnel', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;
