-- 0053 · Cancellation that leaves a record and reaches the candidate.
--
-- Cancelling used to set status = 'cancelled' and nothing else. The slot was
-- freed and the row stayed for history, which is right, but:
--
--   · the candidate was never told, so they kept an invitation for a time
--     that no longer existed and would simply turn up;
--   · the application stayed at 'interviewing', so the pipeline counted
--     someone who had no interview;
--   · no reason was stored, so a month later you cannot tell whether the
--     candidate pulled out, you moved it, or it was a duplicate cleaned up.
--
-- This adds the record. The notifying is done by the route.

alter table interviews
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references profiles(id),
  add column if not exists cancel_reason text,
  -- Whether the candidate was actually told. A cancellation they never heard
  -- about is the failure worth being able to find later.
  add column if not exists cancel_notified boolean not null default false;

comment on column interviews.cancel_reason is
  'Short note on why, kept for the record. Sent to the candidate only when the person cancelling chooses to share it.';
comment on column interviews.cancel_notified is
  'True once the candidate has been emailed about the cancellation. False means they may still be expecting to attend.';

-- Backfill: anything already cancelled predates this, so the candidate was
-- certainly not told. Marked false explicitly rather than left ambiguous.
update interviews
   set cancelled_at = coalesce(cancelled_at, updated_at, created_at),
       cancel_notified = false
 where status = 'cancelled'
   and cancelled_at is null;

create index if not exists interviews_cancelled_idx on interviews(cancelled_at)
  where status = 'cancelled';
