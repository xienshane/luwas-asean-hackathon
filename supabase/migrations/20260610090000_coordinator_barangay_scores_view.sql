-- LUWAS — Phase 3.1: coordinator map read model
--
-- One row per scored barangay for the coordinator dashboard map. Joins the live Silent
-- Area scores (Phase 2.1, recomputed every 15 min by silent_area_score()) onto barangay
-- identity + geometry, and exposes:
--   * centroid latitude/longitude (ST_Y/ST_X) for pin placement and flyTo, and
--   * a simplified boundary polygon as GeoJSON (~0.0003° tolerance) so the Next.js client
--     renders the real-boundary choropleth WITHOUT shipping raw PostGIS geometry. Measured:
--     the full set serialises to ~734 kB simplified (vs ~15 MB unsimplified).
--
-- security_invoker = true: the view runs with the *querying* user's privileges, so the
-- underlying RLS still applies — only a coordinator (silent_area_scores RLS) sees scores;
-- a volunteer/anon gets zero rows from the join rather than a leak.

set search_path = public, extensions;

create or replace view public.coordinator_barangay_scores
with (security_invoker = true) as
select
  b.id,
  b.name,
  b.city_municipality,
  b.province,
  b.population,
  st_y(b.centroid)                                                 as latitude,
  st_x(b.centroid)                                                 as longitude,
  st_asgeojson(st_simplifypreservetopology(b.geom, 0.0003))::jsonb as boundary,
  s.score,
  s.pop_density,
  s.pop_density_norm,
  s.hazard_composite,
  s.hazard_norm,
  s.hours_since_contact,
  s.last_confirmed_contact,
  s.time_factor,
  s.computed_at
from public.barangays b
join public.silent_area_scores s on s.barangay_id = b.id;

comment on view public.coordinator_barangay_scores is
  'Phase 3.1 read model: barangay identity + simplified boundary GeoJSON joined to live '
  'Silent Area scores for the coordinator map. security_invoker so scores RLS (coordinator-only) applies.';

grant select on public.coordinator_barangay_scores to authenticated;
