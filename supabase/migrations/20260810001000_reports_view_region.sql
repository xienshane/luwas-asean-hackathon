-- S10: expose the reporting area's region on the coordinator report feed.
--
-- The view already joins barangays for the name and centroid, so this costs nothing.
-- `region` is null for a report that never geocoded (flagged for review) — those stay
-- visible in every region rather than disappearing, because an unplaced report is
-- exactly the thing a coordinator must not lose track of.
--
-- Appended LAST: `create or replace view` cannot insert a column mid-list.

create or replace view public.coordinator_field_reports as
 SELECT fr.id,
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
    b.name AS barangay_name,
    COALESCE(st_x(fr.location), st_x(b.centroid)) AS lng,
    COALESCE(st_y(fr.location), st_y(b.centroid)) AS lat,
    b.region
   FROM field_reports fr
     LEFT JOIN barangays b ON b.id = fr.barangay_id;
