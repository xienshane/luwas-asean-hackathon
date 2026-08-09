-- Fix: assembled route geometry lost the traversal order, so routes drew a phantom seam and
-- the HQ endpoint marker landed mid-route instead of on the depot.
--
-- The old body did `st_linemerge(st_collect(e.geom order by d.seq))`. ST_LineMerge is a
-- topological merge: it discards the dijkstra order, ignores each edge's traversal direction,
-- and returns a MultiLineString whenever the path's parts don't stitch head-to-tail. The
-- MultiLineString branch then re-assembled the parts in ST_Dump order — which is not path
-- order — so ST_MakeLine welded them with a straight jump between two unrelated points.
-- Observed on the depot -> Catarman dispatch: 2 parts, first vertex 3 km from the depot, and
-- 16.8 km of "distance" against a real 14.0 km path.
--
-- Instead, keep pgr_dijkstra's own ordering and orient every edge to the direction it is
-- actually driven (pgr_dijkstra's `node` is the vertex you leave by that edge, so an edge whose
-- `source` is not that node is traversed backwards and must be reversed). ST_MakeLine over the
-- ordered, oriented array is then a single LineString that starts at the depot vertex, ends at
-- the destination, and never jumps.
create or replace function public.pipeline_save_route(
  p_team_id uuid,
  p_stops   jsonb,
  p_vids    bigint[]
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  i        int;
  geoms    geometry[] := '{}';
  leg      geometry[];
  full_geom geometry;
  new_id   uuid;
  total_m  double precision;
begin
  if p_vids is null or array_length(p_vids, 1) < 2 then
    raise exception 'p_vids must have >= 2 vertices';
  end if;

  for i in 1 .. array_length(p_vids, 1) - 1 loop
    select array_agg(g order by seq) into leg
      from (
        select d.seq,
               case when e.source = d.node then e.geom else st_reverse(e.geom) end as g
          from pgr_dijkstra(
            'select id, source, target, cost, reverse_cost from public.road_edges',
            p_vids[i], p_vids[i + 1], false) d
          join public.road_edges e on e.id = d.edge
         where d.edge <> -1
      ) ordered;
    if leg is not null then
      geoms := geoms || leg;
    end if;
  end loop;

  if array_length(geoms, 1) is null then
    raise exception 'no road geometry found between the given vertices';
  end if;

  -- ST_MakeLine over the ordered, direction-corrected legs -> one LineString in path order.
  full_geom := st_setsrid(st_makeline(geoms), 4326);
  total_m   := coalesce(st_length(full_geom::geography), 0);

  insert into public.routes (team_id, status, geom, total_distance_m, stops)
  values (p_team_id, 'planned', full_geom, total_m, p_stops)
  returning id into new_id;

  return new_id;
end;
$$;

comment on function public.pipeline_save_route(uuid, jsonb, bigint[]) is
  'Assemble a real-road LineString through ordered vids (dijkstra order, edges oriented to '
  'travel direction) and insert a planned route.';

revoke execute on function public.pipeline_save_route(uuid, jsonb, bigint[]) from public;
grant  execute on function public.pipeline_save_route(uuid, jsonb, bigint[]) to service_role;
