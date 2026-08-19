-- S10: expose barangays.region on the coordinator map read model.
--
-- The map, the report feed, and the sitrep all scope to one region at a time. Without
-- this column the client would have to fetch 1,214 barangays across two countries and
-- filter in memory.
--
-- `region` is appended LAST: `create or replace view` cannot insert a column mid-list.

create or replace view public.coordinator_barangay_scores as
 SELECT b.id,
    b.name,
    b.city_municipality,
    b.province,
    b.population,
    st_y(b.centroid) AS latitude,
    st_x(b.centroid) AS longitude,
    st_asgeojson(st_simplifypreservetopology(b.geom, 0.0003::double precision))::jsonb AS boundary,
    s.score,
    s.pop_density,
    s.pop_density_norm,
    s.hazard_composite,
    s.hazard_norm,
    s.hours_since_contact,
    s.last_confirmed_contact,
    s.time_factor,
    s.computed_at,
    s.structural_vuln_frac,
    s.impact_affected,
    s.impact_frac,
    s.nearby_report_km,
    s.nearby_norm,
    s.inputs,
    b.region
   FROM barangays b
     JOIN silent_area_scores s ON s.barangay_id = b.id;
