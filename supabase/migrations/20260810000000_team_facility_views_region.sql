-- S10: expose `region` on the team and facility read models so the coordinator rail,
-- the map hubs, and the dispatch picker all scope to the region on screen.
--
-- Without this the Da Nang view would list four Cebu trucks that cannot reach any
-- Vietnamese ward — the road graphs are disjoint, so dispatching one raises rather than
-- routes. Region is appended LAST (`create or replace view` cannot insert mid-list).

create or replace view public.coordinator_teams as
 SELECT id,
    name,
    capacity_kg,
    status,
    type,
    st_y(base_location) AS base_lat,
    st_x(base_location) AS base_lng,
    region
   FROM teams t;

create or replace view public.coordinator_facilities as
 SELECT id,
    name,
    kind,
    is_depot,
    st_y(geom) AS latitude,
    st_x(geom) AS longitude,
    region
   FROM facilities;
