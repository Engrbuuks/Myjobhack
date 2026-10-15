-- 0059 · An invoice link needs a share token, not just an id.
--
-- app/invoice/[id]/route.ts matched on the id alone, while its own docstring
-- claimed a share token was required, and /invoice/ is public in the
-- middleware. Every invoice in the system was therefore readable by anyone who
-- could guess or walk a uuid: client names, emails, line items and amounts.
--
-- Clients open these links from an email without signing in, so the secret has
-- to travel in the link itself: /invoice/<id>?t=<share_token>.
--
-- Safe to run more than once.

-- gen_random_bytes lives in pgcrypto. Present on Supabase already; asked for
-- here so this migration also applies to a bare database.
create extension if not exists pgcrypto;

alter table invoices
  add column if not exists share_token text;

-- Every new invoice mints its own token, so no application code can forget to.
alter table invoices
  alter column share_token set default encode(gen_random_bytes(16), 'hex');

-- Invoices that predate the column. One token each, not one shared token.
update invoices
   set share_token = encode(gen_random_bytes(16), 'hex')
 where share_token is null;

alter table invoices
  alter column share_token set not null;

create unique index if not exists invoices_share_token_key on invoices (share_token);

comment on column invoices.share_token is
  'Secret half of a public invoice link: /invoice/<id>?t=<share_token>. Never render it on a page that is not the invoice itself.';

notify pgrst, 'reload schema';
