-- ============================================================
-- MYJOBHACK App — Migration 0027 · Volume hiring
-- One posting can recruit many people, with progress tracking.
-- Run after 0026.
-- ============================================================

-- How many people this posting needs to hire (1 = normal single role).
alter table jobs add column if not exists openings int not null default 1;
alter table jobs add column if not exists hired_count int not null default 0;

-- Keep hired_count in sync with applications marked 'hired'.
create or replace function recompute_job_hires(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hired int;
begin
  select count(*) into v_hired from applications where job_id = p_job and status = 'hired';
  update jobs set
    hired_count = v_hired,
    -- auto-close once the posting is full
    status = case when v_hired >= openings and status = 'published' then 'closed' else status end
  where id = p_job;
end $$;

create or replace function application_hire_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recompute_job_hires(coalesce(new.job_id, old.job_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_application_hire on applications;
create trigger trg_application_hire
  after insert or update of status or delete on applications
  for each row execute function application_hire_sync();

notify pgrst, 'reload schema';
