-- Bounded road geometry near a barangay, for the volunteer "pick the blocked road" map.
-- Public infrastructure only (no PII). Capped so a phone can render + tap it. SECURITY DEFINER
-- because road_edges is not directly client-readable; granted to authenticated (any signed-in
-- volunteer). Uses the GiST index (&&) + KNN (<->) so it does not scan the 117k-edge graph.
create or replace function public.barangay_road_edges(p_barangay_id uuid)
returns table (id bigint, name text, impassable boolean, geometry jsonb)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
  with b as (select centroid from public.barangays where id = p_barangay_id)
  select e.id, e.name, e.impassable, st_asgeojson(e.geom)::jsonb
    from public.road_edges e, b
   where e.geom is not null
     and e.geom && st_expand(b.centroid, 0.02)   -- ~2.2 km bbox at Cebu latitude (index)
   order by e.geom <-> b.centroid                 -- nearest first (KNN index)
   limit 1000;
$function$;

revoke execute on function public.barangay_road_edges(uuid) from public;
grant  execute on function public.barangay_road_edges(uuid) to authenticated;
