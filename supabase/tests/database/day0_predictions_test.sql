-- LUWAS — Phase 4.x: Day-0 forecast (report-independent impact prediction).
-- Run with the Supabase CLI:  supabase test db
-- (or execute against a database that has the pgtap extension enabled).
begin;
select plan(5);

-- The Day-0 target selector exists.
select has_function('public', 'pipeline_targets_day0', 'pipeline_targets_day0 function exists');

-- It is report-INDEPENDENT: with zero field reports it still returns targets,
-- unlike pipeline_targets which gates on a recent active report.
delete from public.field_reports;
select ok(
  (select count(*) from public.pipeline_targets_day0(10)) > 0,
  'returns barangay targets even with an empty field_reports table'
);

-- It honours the limit cap.
select ok(
  (select count(*) from public.pipeline_targets_day0(3)) <= 3,
  'respects the p_limit cap'
);

-- Predictions carry the Day-0 marker, surfaced to the coordinator read model.
select has_column('public', 'impact_predictions', 'is_day0', 'impact_predictions.is_day0 exists');
select has_column('public', 'coordinator_impact_predictions', 'is_day0', 'coordinator view exposes is_day0');

select * from finish();
rollback;
