-- Simplified barangay boundary GeoJSON for the volunteer blocked-road picker. Public geometry
-- only (no PII). SECURITY DEFINER because barangays.geom is not directly client-readable; granted
-- to authenticated. ~0.0003° tolerance matches the coordinator choropleth.
create or replace function public.barangay_boundary(p_barangay_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $function$
  select st_asgeojson(st_simplifypreservetopology(geom, 0.0003))::jsonb
    from public.barangays
   where id = p_barangay_id and geom is not null;
$function$;

revoke execute on function public.barangay_boundary(uuid) from public;
grant  execute on function public.barangay_boundary(uuid) to authenticated;
