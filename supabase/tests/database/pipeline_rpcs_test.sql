begin;
select plan(6);

-- Two real Cebu City barangay centroids -> a 2x2 matrix with a finite off-diagonal.
with two as (
  select jsonb_agg(jsonb_build_object('lat', st_y(centroid), 'lng', st_x(centroid))) pts
  from (
    select centroid from public.barangays
     where city_municipality ilike 'cebu city%' and population is not null and centroid is not null
     order by population desc limit 2
  ) s
)
select ok(
  ((public.pipeline_cost_matrix((select pts from two), 30) -> 'seconds' -> 0 ->> 1)::double precision)
     between 1 and 100000,
  'off-diagonal seconds is finite and positive'
)
from two;

with two as (
  select jsonb_agg(jsonb_build_object('lat', st_y(centroid), 'lng', st_x(centroid))) pts
  from (select centroid from public.barangays
         where city_municipality ilike 'cebu city%' and population is not null and centroid is not null
         order by population desc limit 2) s
)
select is(
  ((public.pipeline_cost_matrix((select pts from two), 30) -> 'seconds' -> 0 ->> 0)),
  '0',
  'diagonal is zero'
) from two;

select ok(
  jsonb_array_length(public.pipeline_cost_matrix(
    jsonb_build_array(jsonb_build_object('lat',10.3158,'lng',123.8917)), 30) -> 'vids') = 1,
  'returns one snapped vid per input point'
);

-- A4 constraint smoke: upsert twice, expect one row.
insert into public.impact_predictions (barangay_id, model, predicted_affected)
  select id, 'heuristic', 100 from public.barangays where geom is not null limit 1
  on conflict (barangay_id) do update set predicted_affected = excluded.predicted_affected;
insert into public.impact_predictions (barangay_id, model, predicted_affected)
  select id, 'heuristic', 200 from public.barangays where geom is not null limit 1
  on conflict (barangay_id) do update set predicted_affected = excluded.predicted_affected;
select ok(
  (select count(*) from public.impact_predictions
     where barangay_id = (select id from public.barangays where geom is not null limit 1)) = 1,
  'upsert keeps one current prediction per barangay'
);

-- Build a 2-vertex real-road route and confirm it persists with sane geometry.
with two as (
  select array_agg(vid) vids from (
    select (select v.id from public.road_edges_vertices_pgr v
              order by v.the_geom <-> b.centroid limit 1) vid
      from public.barangays b
     where b.city_municipality ilike 'cebu city%' and b.population is not null
     order by b.population desc limit 2) s
),
saved as (
  select public.pipeline_save_route(
    (select id from public.teams limit 1),
    '[{"barangay_name":"test"}]'::jsonb,
    (select vids from two)) as route_id
)
select ok((select route_id from saved) is not null, 'pipeline_save_route returns a route id');

select ok(
  (select total_distance_m from public.routes order by created_at desc limit 1) > 0,
  'persisted route has positive real-road length'
);

select * from finish();
rollback;
