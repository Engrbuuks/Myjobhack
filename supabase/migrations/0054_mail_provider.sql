-- 0054 · Record which provider sent each message.
--
-- With a fallback sender the log has to say which route a message took.
-- Otherwise a deliverability problem confined to one provider is invisible:
-- every row looks the same, and you cannot tell whether the twelve messages
-- that bounced all went out through the same sender.

alter table email_log
  add column if not exists provider text not null default 'resend';

comment on column email_log.provider is
  'resend or brevo. Which sender actually delivered this message, so per provider failure rates can be compared.';

create index if not exists email_log_provider_idx on email_log(provider, sent_at desc);
