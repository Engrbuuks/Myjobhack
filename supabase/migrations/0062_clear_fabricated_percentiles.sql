-- ============================================================
-- 0062 · Remove the percentiles that were never measured.
--
-- Run after 0061. Safe to run more than once.
--
-- WHAT WENT WRONG: the assessment scorer returned a percentile of 50 whenever
-- fewer than five people had sat the assessment in that field, and that 50 was
-- written to talent_profiles.competency_percentile and shown to the candidate
-- as "Top 50% in your field". At this platform's volume that was most
-- candidates in most fields, each told a ranking that had been made up.
--
-- The code now stores null in that case. This clears the figures already
-- written, and ONLY those: a genuine 50, from a field where enough people have
-- sat the assessment to rank anyone, is left exactly as it is.
-- ============================================================

with cohort as (
  select competency_field, count(*) as n
    from talent_profiles
   where competency_field is not null
     and competency_score is not null
   group by competency_field
)
update talent_profiles tp
   set competency_percentile = null
  from cohort c
 where tp.competency_field = c.competency_field
   and c.n < 5
   and tp.competency_percentile = 50;

-- Also catch a row that carries the placeholder with no field at all, which
-- cannot have been ranked against anything.
update talent_profiles
   set competency_percentile = null
 where competency_percentile = 50
   and (competency_field is null or competency_score is null);

do $$
declare
  remaining int;
begin
  select count(*) into remaining
    from talent_profiles tp
    left join (
      select competency_field, count(*) as n
        from talent_profiles
       where competency_field is not null and competency_score is not null
       group by competency_field
    ) c on c.competency_field = tp.competency_field
   where tp.competency_percentile = 50
     and coalesce(c.n, 0) < 5;

  if remaining > 0 then
    raise exception '0062 did not take: % unmeasured percentiles remain.', remaining;
  end if;

  raise notice '0062 applied. Candidates in fields with fewer than five assessments no longer show a ranking that was never calculated.';
end $$;
