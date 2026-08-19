-- S10: confine a pipeline run to one country pack.
--
-- Confirming a report calls runPipeline(report.barangayId), and pipeline_targets then
-- returned the triggering barangay PLUS the top active-need barangays globally. With two
-- packs loaded, confirming the Đà Nẵng report pulled in seven Cebu barangays — and the
-- pipeline upserts `impact_predictions` and `supply_manifests` by barangay_id, so a
-- Vietnamese confirm would have silently rewritten curated Cebu demo state, mid-take.
--
-- A coordinator works one region at a time. When a triggering barangay is given, the run
-- is now scoped to that barangay's region. With no trigger (the whole-region rescore and
-- the Day-0 path) behaviour is unchanged.
--
-- Signature is unchanged, so every existing caller and test is untouched.

create or replace function public.pipeline_targets(
  p_barangay_id uuid default null::uuid,
  p_limit integer default 10
)
returns table(barangay_id uuid, name text, province text, population integer,
              lat double precision, lng double precision, score double precision,
              province_housing_units bigint, province_households bigint,
              structural_vuln_frac double precision, unimproved_water_frac double precision)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with scope as (
    -- null when there is no trigger, which leaves the region filter inert.
    select region from public.barangays where id = p_barangay_id
  ),
  active as (
    select distinct fr.barangay_id
      from public.field_reports fr
     where fr.barangay_id is not null
       and fr.status <> 'flagged'
       and fr.created_at > now() - interval '72 hours'
  ),
  candidates as (
    select b.id
      from public.barangays b
     where b.population is not null and b.centroid is not null
       and (b.id in (select barangay_id from active)
            or b.id = p_barangay_id)
       and (not exists (select 1 from scope)
            or b.region = (select region from scope))
  )
  select b.id, b.name, b.province, b.population,
         st_y(b.centroid), st_x(b.centroid),
         coalesce(s.score, 0),
         pf.province_housing_units, pf.province_households,
         pf.structural_vuln_frac, pf.unimproved_water_frac
    from public.barangays b
    join candidates c on c.id = b.id
    left join public.silent_area_scores s on s.barangay_id = b.id
    left join public.province_impact_features pf on pf.province = b.province
   order by (b.id = p_barangay_id) desc, coalesce(s.score, 0) desc
   limit greatest(p_limit, 1);
$function$;
