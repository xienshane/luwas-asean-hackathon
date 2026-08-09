-- S10: make dispatch region-aware, and give Da Nang a depot and a team.
--
-- `dispatch_route` picked the single global depot:
--     from public.facilities where is_depot = true order by created_at limit 1
-- With two country packs loaded that always returns the Cebu depot, so dispatching to a
-- Da Nang ward would try to route from Cebu — and the two road graphs are disjoint
-- components ~1,300 km apart, so pgr_dijkstra returns no path and the dispatch fails.
--
-- The depot is now chosen in the same region as the target barangay. For Cebu the
-- behaviour is identical: one Cebu depot, one Cebu region.

alter table public.facilities add column if not exists region text not null default 'cebu';
alter table public.teams      add column if not exists region text not null default 'cebu';

comment on column public.facilities.region is
  'Country-pack this facility serves. dispatch_route matches it to the target barangay.';
comment on column public.teams.region is
  'Country-pack this team operates in. The roster and map are scoped to one region.';

create index if not exists facilities_region_idx on public.facilities (region);
create index if not exists teams_region_idx      on public.teams (region);

-- The one-depot rule becomes one depot PER REGION. It was `unique ((true)) where is_depot`,
-- a global singleton, which is right for one country and wrong for two.
drop index if exists public.facilities_one_depot_idx;
create unique index if not exists facilities_one_depot_per_region_idx
  on public.facilities (region) where is_depot;

-- ---------------------------------------------------------------------------
-- Da Nang depot + team (idempotent, keyed by name).
--
-- The depot sits on the WEST bank in Phường Hải Châu; the wards most exposed to
-- flooding are across the Hàn River. Any delivery east therefore has to cross a real
-- bridge, which is the point: the route is constrained by the same geography the
-- coordinator is.
-- ---------------------------------------------------------------------------
insert into public.facilities (name, kind, geom, is_depot, region)
select 'Đà Nẵng Relief Depot', 'depot',
       st_setsrid(st_makepoint(108.2208, 16.0678), 4326), true, 'danang'
where not exists (
  select 1 from public.facilities where name = 'Đà Nẵng Relief Depot'
);

insert into public.teams (name, capacity_kg, base_location, status, type, region)
select 'Đà Nẵng Logistics 1', 2000,
       st_setsrid(st_makepoint(108.2208, 16.0678), 4326), 'idle', 'truck', 'danang'
where not exists (
  select 1 from public.teams where name = 'Đà Nẵng Logistics 1'
);

-- ---------------------------------------------------------------------------
-- dispatch_route: depot must match the target barangay's region.
-- Body is otherwise unchanged from 20260620100000_dispatch_route.sql.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_route(p_team_id uuid, p_barangay_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  depot_pt  geometry;
  brgy_pt   geometry;
  brgy_name text;
  brgy_rgn  text;
  dv        bigint;
  bv        bigint;
  new_id    uuid;
begin
  select centroid, name, region into brgy_pt, brgy_name, brgy_rgn
    from public.barangays where id = p_barangay_id;
  select geom into depot_pt
    from public.facilities
   where is_depot = true and region = brgy_rgn
   order by created_at limit 1;
  if depot_pt is null or brgy_pt is null then
    raise exception 'dispatch_route: no depot in region % (or missing barangay geometry)', brgy_rgn;
  end if;

  select id into dv from public.road_edges_vertices_pgr order by the_geom <-> depot_pt limit 1;
  select id into bv from public.road_edges_vertices_pgr order by the_geom <-> brgy_pt  limit 1;
  if dv is null or bv is null or dv = bv then
    raise exception 'dispatch_route: could not map depot/barangay to the road graph';
  end if;

  delete from public.routes where team_id = p_team_id and status = 'active'; -- one active route per team

  new_id := public.pipeline_save_route(
    p_team_id,
    jsonb_build_array(jsonb_build_object(
      'sequence', 1,
      'barangayId', p_barangay_id::text,
      'barangayName', brgy_name,
      'action', 'Relief delivery')),
    array[dv, bv]);

  update public.routes set status = 'active' where id = new_id;
  return new_id;
end;
$function$;
