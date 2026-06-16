-- LUWAS — Phase 4.5: coordinate snap wrapper for coordinator click-to-block.
--
-- The coordinator "Block road" map mode sends a clicked {lat,lng}; this wraps
-- nearest_road_edge() so the API can snap without marshalling a geometry through
-- PostgREST. Pure DB, service-role only.

set search_path = public, extensions;

create or replace function public.nearest_road_edge_at(
  p_lat double precision,
  p_lng double precision
) returns bigint
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select public.nearest_road_edge(st_setsrid(st_makepoint(p_lng, p_lat), 4326));
$$;

comment on function public.nearest_road_edge_at(double precision, double precision) is
  'Phase 4.5: snap a {lat,lng} to the closest road_edges id (wraps nearest_road_edge).';

revoke execute on function public.nearest_road_edge_at(double precision, double precision) from public;
grant  execute on function public.nearest_road_edge_at(double precision, double precision) to service_role;
