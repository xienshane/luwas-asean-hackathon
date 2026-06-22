-- Roads for the volunteer picker, scoped to the barangay's real boundary (declutters vs the old
-- ~2.2km bbox). Small buffer (~150m) keeps edge-of-barangay roads selectable. Falls back to the
-- bbox when the barangay has no polygon OR the clip is empty (sparse graph coverage).
create or replace function public.barangay_road_edges(p_barangay_id uuid)
returns table (id bigint, name text, impassable boolean, geometry jsonb)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
  with b as (select centroid, geom from public.barangays where id = p_barangay_id),
  clipped as (
    select e.id, e.name, e.impassable, e.geom
      from public.road_edges e, b
     where b.geom is not null
       and e.geom is not null
       and st_intersects(e.geom, st_buffer(b.geom, 0.0015))
     order by e.geom <-> (select centroid from b)
     limit 600
  ),
  bbox as (
    select e.id, e.name, e.impassable, e.geom
      from public.road_edges e, b
     where e.geom is not null
       and e.geom && st_expand(b.centroid, 0.02)
     order by e.geom <-> (select centroid from b)
     limit 600
  )
  select id, name, impassable, st_asgeojson(geom)::jsonb
    from (
      select * from clipped
      union all
      select * from bbox where not exists (select 1 from clipped)  -- fallback only if clip empty
    ) s;
$function$;

grant execute on function public.barangay_road_edges(uuid) to authenticated;
