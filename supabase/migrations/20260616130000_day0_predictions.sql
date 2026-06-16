-- LUWAS — Day-0 forecast: report-independent impact prediction.
--
-- "Day 0" = the start of a response, before ANY field report (app or SMS) exists. The
-- TabPFN inference path consumes only static features + a coordinator-chosen storm
-- category, so it can run pre-report. The ONLY report coupling was target selection
-- (pipeline_targets gates on a recent active report). This migration adds a
-- report-independent selector plus an is_day0 marker so the console can label the output
-- "Predicted — Unconfirmed (Day 0)". Additive: the report-driven pipeline is untouched.
set search_path = public, extensions;

-- 1 ─ Mark predictions produced by the Day-0 forecast (vs. the report-driven pipeline).
alter table public.impact_predictions
  add column if not exists is_day0 boolean not null default false;

-- 2 ─ Day-0 target selector: top barangays by Silent-Area score with NO report
--     dependency (mirrors pipeline_targets' return shape + assembled province features).
create or replace function public.pipeline_targets_day0(
  p_limit int default 50
) returns table (
  barangay_id uuid,
  name        text,
  province    text,
  population  integer,
  lat         double precision,
  lng         double precision,
  score       double precision,
  province_housing_units bigint,
  province_households     bigint,
  structural_vuln_frac    double precision,
  unimproved_water_frac   double precision
)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select b.id, b.name, b.province, b.population,
         st_y(b.centroid), st_x(b.centroid),
         coalesce(s.score, 0),
         pf.province_housing_units, pf.province_households,
         pf.structural_vuln_frac, pf.unimproved_water_frac
    from public.barangays b
    left join public.silent_area_scores s on s.barangay_id = b.id
    left join public.province_impact_features pf on pf.province = b.province
   where b.population is not null and b.centroid is not null
   order by coalesce(s.score, 0) desc, b.population desc
   limit greatest(p_limit, 1);
$$;

comment on function public.pipeline_targets_day0(int) is
  'Day-0 forecast target selector: top barangays by Silent-Area score, report-independent.';

revoke execute on function public.pipeline_targets_day0(int) from public;
grant  execute on function public.pipeline_targets_day0(int) to service_role;

-- 3 ─ Surface is_day0 to the coordinator read model so the UI can render the Day-0 badge.
create or replace view public.coordinator_impact_predictions
with (security_invoker = true) as
  select barangay_id, model, predicted_affected, damage_severity,
         confidence, override_value, inputs, created_at, is_day0
    from public.impact_predictions;
grant select on public.coordinator_impact_predictions to authenticated;
