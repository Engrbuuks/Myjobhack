-- ============================================================
-- MYJOBHACK App — Migration 0021 · Invoice upgrade
--  • part payments (a ledger of payments against an invoice)
--  • richer invoice fields (due date, paid tracking)
--  • receipts
-- Run after 0020.
-- ============================================================

-- Extra invoice fields
alter table invoices add column if not exists amount_paid numeric not null default 0;
alter table invoices add column if not exists due_date date;
alter table invoices add column if not exists issued_date date not null default current_date;
-- status now includes 'partial'
comment on column invoices.status is 'draft | sent | partial | paid | void';

-- Ledger: every payment recorded against an invoice (supports part payment)
create table if not exists invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null default 'transfer',   -- transfer | cash | card | paystack | other
  reference text,                            -- teller no / txn ref
  note text,
  receipt_number text,                       -- set when a receipt is generated
  paid_at timestamptz not null default now(),
  recorded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ip_invoice_idx on invoice_payments (invoice_id, paid_at);
alter table invoice_payments enable row level security;
create policy "invoice pay staff" on invoice_payments
  for all using (is_staff()) with check (is_staff());

-- Recompute invoice paid total + status whenever the ledger changes.
create or replace function recompute_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paid numeric; v_total numeric;
begin
  select coalesce(sum(amount),0) into v_paid from invoice_payments where invoice_id = p_invoice;
  select total into v_total from invoices where id = p_invoice;
  update invoices set
    amount_paid = v_paid,
    status = case
      when status = 'void' then 'void'
      when v_paid <= 0 then status              -- keep draft/sent
      when v_paid >= v_total then 'paid'
      else 'partial'
    end,
    paid_at = case when v_paid >= v_total then now() else null end
  where id = p_invoice;
end $$;

create or replace function invoice_payment_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recompute_invoice(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_invoice_payment on invoice_payments;
create trigger trg_invoice_payment
  after insert or update or delete on invoice_payments
  for each row execute function invoice_payment_touch();

-- Receipt numbering sequence
create sequence if not exists receipt_seq start 1001;

notify pgrst, 'reload schema';

-- Helper so the API can pull a receipt sequence value
create or replace function nextval_receipt() returns bigint
language sql security definer set search_path = public as $$
  select nextval('receipt_seq');
$$;

notify pgrst, 'reload schema';
