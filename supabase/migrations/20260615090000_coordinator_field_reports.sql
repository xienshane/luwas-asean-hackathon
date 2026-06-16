-- LUWAS — coordinator read model for field reports.
--
-- Fixes "Unknown barangay" on the coordinator view: the client used to load the
-- whole barangay_directory and resolve names in a Map, but PostgREST caps
-- responses at 1,000 rows while the directory has ~1,211 barangays, so reports
-- whose barangay sorted past the cap resolved to "Unknown barangay". This view
-- joins the name server-side (no cap dependency) and resolves the pin location
-- to the report's own location, falling back to the barangay centroid.
--
-- security_invoker = true: barangays + field_reports RLS still applies, mirroring
-- the other coordinator_* views.
set search_path = public, extensions;

create or replace view public.coordinator_field_reports
with (security_invoker = true) as
  select fr.id,
         fr.barangay_id,
         fr.source,
         fr.raw_text,
         fr.population_estimate,
         fr.needs_severity,
         fr.road_status,
         fr.road_impassable,
         fr.confidence,
         fr.status,
         fr.created_at,
         fr.offline_synced,
         b.name as barangay_name,
         coalesce(st_x(fr.location), st_x(b.centroid)) as lng,
         coalesce(st_y(fr.location), st_y(b.centroid)) as lat
    from public.field_reports fr
    left join public.barangays b on b.id = fr.barangay_id;

comment on view public.coordinator_field_reports is
  'Field reports with barangay name joined server-side and pin lat/lng resolved (report location, else barangay centroid). Removes the client-side directory 1,000-row cap dependency.';

grant select on public.coordinator_field_reports to authenticated;
