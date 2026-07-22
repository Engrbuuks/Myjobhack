-- ============================================================
-- MYJOBHACK App — Migration 0037 · Coupons for training prices
--
-- Discount codes applied at checkout. Scoped so a code can be:
--   • global (any training) or tied to one specific training
--   • percentage off or a fixed naira amount off
--   • limited by total uses, per-person uses, and a date window
--
-- Redemptions are recorded so limits are enforceable and you can see
-- which codes actually drive enrolments.
-- Run after 0036.
-- ============================================================

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,                          -- what the user types, stored uppercase
  label text,                                  -- internal note e.g. "Alumni launch"
  kind text not null default 'percent',        -- 'percent' | 'amount'
  value numeric not null,                      -- 20 = 20% off, or 5000 = ₦5,000 off
  training_id uuid references trainings(id) on delete cascade,  -- null = all trainings
  max_redemptions int,                         -- null = unlimited
  max_per_user int not null default 1,
  min_amount_ngn numeric not null default 0,   -- only applies above this price
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  redemptions int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One code per training scope: the same word can exist globally and per-training,
-- but never twice in the same scope.
create unique index if not exists coupons_code_scope_idx
  on coupons (upper(code), coalesce(training_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  training_id uuid references trainings(id) on delete set null,
  original_amount numeric not null,
  discount_amount numeric not null,
  final_amount numeric not null,
  payment_id uuid references payments(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on coupon_redemptions (coupon_id);
create index if not exists coupon_redemptions_user_idx on coupon_redemptions (profile_id, coupon_id);

alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;

-- Staff manage coupons; signed-in users may read active ones to validate a code.
drop policy if exists "coupons staff" on coupons;
create policy "coupons staff" on coupons
  for all using (is_staff() or is_admin_or_service())
  with check (is_staff() or is_admin_or_service());

drop policy if exists "coupons read active" on coupons;
create policy "coupons read active" on coupons
  for select using (active = true or is_staff() or is_admin_or_service());

drop policy if exists "coupon_redemptions own or staff" on coupon_redemptions;
create policy "coupon_redemptions own or staff" on coupon_redemptions
  for all using (profile_id = auth.uid() or is_staff() or is_admin_or_service())
  with check (profile_id = auth.uid() or is_staff() or is_admin_or_service());

-- Keep the redemption counter accurate.
create or replace function bump_coupon_redemptions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update coupons set redemptions = redemptions + 1 where id = new.coupon_id;
  return new;
end $$;

drop trigger if exists trg_bump_coupon on coupon_redemptions;
create trigger trg_bump_coupon after insert on coupon_redemptions
  for each row execute function bump_coupon_redemptions();

notify pgrst, 'reload schema';
