-- Dispatch: a real-road route from the supply hub (depot) to one barangay, for one team.
-- Reuses pipeline_save_route, which runs pgr_dijkstra over road_edges and is therefore
-- block-aware (set_edge_impassable raises an edge's cost). One active route per team.
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
  dv        bigint;
  bv        bigint;
  new_id    uuid;
begin
  select geom into depot_pt
    from public.facilities where is_depot = true order by created_at limit 1;
  select centroid, name into brgy_pt, brgy_name
    from public.barangays where id = p_barangay_id;
  if depot_pt is null or brgy_pt is null then
    raise exception 'dispatch_route: missing depot or barangay geometry';
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

-- Rebuild every active route's geometry against current edge costs, so a newly blocked road
-- makes dispatched routes visibly redraw. (The pipeline only regenerates 'planned' routes.)
create or replace function public.reroute_active_dispatch_routes()
returns int
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare rec record; n int := 0;
begin
  create temp table _active_dispatch on commit drop as
    select distinct team_id, (stops->0->>'barangayId')::uuid as brgy
      from public.routes
     where status = 'active' and team_id is not null
       and stops->0->>'barangayId' is not null;

  for rec in select * from _active_dispatch loop
    begin
      perform public.dispatch_route(rec.team_id, rec.brgy);
      n := n + 1;
    exception when others then
      raise warning 'reroute_active_dispatch_routes: % -> % failed: %', rec.team_id, rec.brgy, sqlerrm;
    end;
  end loop;
  return n;
end;
$function$;

grant execute on function public.dispatch_route(uuid, uuid) to authenticated;
grant execute on function public.reroute_active_dispatch_routes() to authenticated;
