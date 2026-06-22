-- LUWAS — Phase 4.1: coordinator read models for live pipeline output,
-- the pipeline target selector, and Realtime on the three pipeline tables.
set search_path = public, extensions;

-- 1 ─ routes (geom as GeoJSON for MapLibre)
create or replace view public.coordinator_routes
with (security_invoker = true) as
  select r.id, r.team_id, t.name as team_name, r.status,
         r.total_distance_m, r.stops,
         st_asgeojson(r.geom)::jsonb as geometry,
         r.created_at
    from public.routes r
    left join public.teams t on t.id = r.team_id;
grant select on public.coordinator_routes to authenticated;

-- 2 ─ impact predictions
create or replace view public.coordinator_impact_predictions
with (security_invoker = true) as
  select barangay_id, model, predicted_affected, damage_severity,
         confidence, override_value, inputs, created_at
    from public.impact_predictions;
grant select on public.coordinator_impact_predictions to authenticated;

-- 3 ─ supply manifests
create or replace view public.coordinator_supply_manifests
with (security_invoker = true) as
  select barangay_id, impact_prediction_id, days, access_modifier,
         water_l, food_packs, shelter_kits, blankets, breakdown, overridden, created_at
    from public.supply_manifests;
grant select on public.coordinator_supply_manifests to authenticated;

-- 4 ─ road status: ONLY flagged/impassable edges (NOT the 117k-edge graph).
create or replace view public.coordinator_road_status
with (security_invoker = true) as
  select id, name, length_m, impassable,
         st_asgeojson(geom)::jsonb as geometry
    from public.road_edges
   where impassable = true;
grant select on public.coordinator_road_status to authenticated;

-- 5 ─ volunteer roster (coordinator-only via volunteers RLS; for TeamsView crew).
create or replace view public.coordinator_volunteers
with (security_invoker = true) as
  select id, full_name, team_id, status, last_location_at
    from public.volunteers;
grant select on public.coordinator_volunteers to authenticated;

-- 6 ─ pipeline target selector: barangays with an active (non-flagged) report in
--     the last 72h OR top Silent-Area score, capped, always including p_barangay_id.
--     Returns identity + score + centroid + the assembled province features.
create or replace function public.pipeline_targets(
  p_barangay_id uuid default null,
  p_limit       int  default 10
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
  with active as (
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
$$;

revoke execute on function public.pipeline_targets(uuid, int) from public;
grant  execute on function public.pipeline_targets(uuid, int) to service_role;

-- 7 ─ Realtime: add the three pipeline tables (idempotent).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                  and schemaname='public' and tablename='impact_predictions') then
    alter publication supabase_realtime add table public.impact_predictions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                  and schemaname='public' and tablename='supply_manifests') then
    alter publication supabase_realtime add table public.supply_manifests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
                  and schemaname='public' and tablename='routes') then
    alter publication supabase_realtime add table public.routes;
  end if;
end $$;
