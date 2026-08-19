-- S10: confine the Day-0 anticipatory forecast to one country pack.
--
-- pipeline_targets_day0 took only a limit and ranked globally by Silent-Area score. With
-- two packs loaded that is not merely unscoped, it is unusable for the smaller one: Cebu's
-- 50th-ranked barangay scores 0.654 and Đà Nẵng's highest-ranked ward scores 0.454, so a
-- Day-0 run from a map of Đà Nẵng returned 50 Philippine barangays and zero Vietnamese
-- ones — while upserting `is_day0 = true` across curated Cebu demo state.
--
-- Ranking cross-country is meaningless anyway. The score is min-max normalised over all
-- rows, so comparing a ward against a barangay compares their positions in a shared
-- distribution, not their need. A coordinator works one region; the forecast should too.
--
-- This mirrors the scoping pipeline_targets already got in 20260810005000_pipeline_targets_region:
-- when a region is given, candidates are confined to it; when it is null, behaviour is
-- exactly as before, so existing callers are unaffected.
--
-- The signature gains a parameter, which `create or replace` cannot do — hence the drop.

drop function if exists public.pipeline_targets_day0(integer);

create function public.pipeline_targets_day0(
  p_limit  integer default 50,
  p_region text    default null
)
returns table(
  barangay_id uuid, name text, province text, population integer,
  lat double precision, lng double precision, score double precision,
  province_housing_units bigint, province_households bigint,
  structural_vuln_frac double precision, unimproved_water_frac double precision
)
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select b.id, b.name, b.province, b.population,
         st_y(b.centroid), st_x(b.centroid),
         coalesce(s.score, 0),
         pf.province_housing_units, pf.province_households,
         pf.structural_vuln_frac, pf.unimproved_water_frac
    from public.barangays b
    left join public.silent_area_scores s on s.barangay_id = b.id
    left join public.province_impact_features pf on pf.province = b.province
   where b.population is not null and b.centroid is not null
     and (p_region is null or b.region = p_region)
   order by coalesce(s.score, 0) desc, b.population desc
   limit greatest(p_limit, 1);
$function$;

comment on function public.pipeline_targets_day0(integer, text) is
  'Day-0 anticipatory targets: top barangays by Silent-Area score, no report required. '
  'Pass p_region to confine the run to one country pack; null preserves the original '
  'global behaviour.';

revoke all on function public.pipeline_targets_day0(integer, text) from public;
grant execute on function public.pipeline_targets_day0(integer, text) to service_role;
