-- LUWAS — SEA-LION translation: persist an English translation of each report.
--
-- translated_text holds an English translation of raw_text (null when the report
-- is already English or not yet translated). SMS/parsed reports fill it via the
-- /parse contract; app (volunteer) reports fill it lazily on coordinator confirm
-- via the /translate endpoint. The coordinator view exposes it so the dashboard
-- can show the translation by default with a toggle back to the original.
set search_path = public, extensions;

alter table public.field_reports
  add column if not exists translated_text text;

comment on column public.field_reports.translated_text is
  'English translation of raw_text (null if already English or not yet translated).';

-- Re-create the coordinator read model to surface translated_text. Dropped first
-- because CREATE OR REPLACE VIEW cannot insert a column mid-list (only append).
drop view if exists public.coordinator_field_reports;
create view public.coordinator_field_reports
with (security_invoker = true) as
  select fr.id,
         fr.barangay_id,
         fr.source,
         fr.raw_text,
         fr.translated_text,
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

grant select on public.coordinator_field_reports to authenticated;
