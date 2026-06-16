-- Phase 4.5 live-reroute wiring tests (pgTAP) — extends the 2.6 dynamic-edge engine.
--
-- Run with the Supabase CLI:  supabase test db
-- (or execute against a database with pgtap + pgrouting + postgis enabled).
--
-- New behaviour proven here (on top of 20260606101500_dynamic_edge_updates.sql):
--   * set_edge_impassable() now records WHO blocked an edge, WHEN, and WHY
--     (road_edges.blocked_by / blocked_at / block_reason); restoring clears them.
--   * A volunteer field report that flags a road impassable WITHOUT naming an edge
--     (impassable_edge_id is null) but WITH a GPS location auto-snaps to the nearest
--     road_edges row, writes that id back onto the report, and blocks the edge — so
--     the optimal route reroutes around it. nearest_road_edge() is the snap helper.
--
-- The whole file runs in one transaction and rolls back, leaving no fixtures behind.

begin;
set search_path = public, extensions, pg_temp;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixture: a 4-node diamond from node 1 to node 4 with two paths, plus geom so
-- the KNN snap has real LineStrings to choose from. Coordinates are placed far
-- from real Cebu road_edges so nearest_road_edge() picks a fixture edge.
--   cheap path : 1 --(e1, cost 1)--> 2 --(e2, cost 1)--> 4   (total 2)
--   detour     : 1 --(e3, cost 5)--> 3 --(e4, cost 5)--> 4   (total 10)
-- ---------------------------------------------------------------------------
insert into public.road_edges (id, source, target, cost, reverse_cost, geom) values
  (900000001, 1, 2, 1, 1, st_setsrid(st_makeline(st_makepoint(0,0), st_makepoint(1,0)), 4326)),
  (900000002, 2, 4, 1, 1, st_setsrid(st_makeline(st_makepoint(1,0), st_makepoint(2,0)), 4326)),
  (900000003, 1, 3, 5, 5, st_setsrid(st_makeline(st_makepoint(0,0), st_makepoint(1,1)), 4326)),
  (900000004, 3, 4, 5, 5, st_setsrid(st_makeline(st_makepoint(1,1), st_makepoint(2,0)), 4326));

-- 1. Coordinator-attributed block records who/when/why.
select public.set_edge_impassable(
  900000001, true, null,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'coordinator: bridge collapsed'
);
select ok(
  (select impassable
            and blocked_by = '11111111-1111-1111-1111-111111111111'::uuid
            and blocked_at is not null
            and block_reason = 'coordinator: bridge collapsed'
     from public.road_edges where id = 900000001),
  'blocking records actor (blocked_by), timestamp (blocked_at) and reason (block_reason)'
);

-- 2. Restoring clears the audit fields and the cost.
select public.set_edge_impassable(900000001, false);
select ok(
  (select not impassable
            and blocked_by is null
            and blocked_at is null
            and block_reason is null
            and cost = 1
     from public.road_edges where id = 900000001),
  'restoring clears blocked_by/blocked_at/block_reason and the original cost'
);

-- 3. nearest_road_edge() snaps a point to the closest fixture edge (e1).
select is(
  public.nearest_road_edge(st_setsrid(st_makepoint(0.5, 0.01), 4326)),
  900000001::bigint,
  'nearest_road_edge() returns the closest edge to a point'
);

-- 4. A volunteer report with NO edge id but WITH a location auto-snaps + blocks the edge.
insert into public.field_reports (source, road_status, road_impassable, impassable_edge_id, location, status)
values ('app', 'impassable', true, null,
        st_setsrid(st_makepoint(0.5, 0.01), 4326), 'pending');
select ok(
  (select impassable and cost >= 1e9 from public.road_edges where id = 900000001),
  'a located report with no edge id auto-snaps to the nearest edge and blocks it'
);

-- 5. The resolved edge id is written back onto the report.
select is(
  (select impassable_edge_id from public.field_reports
     where road_impassable and impassable_edge_id is not null
     order by created_at desc limit 1),
  900000001::bigint,
  'the snapped edge id is written back onto the field report'
);

-- 6. The auto-blocked edge is attributed to the volunteer-report path.
select is(
  (select block_reason from public.road_edges where id = 900000001),
  'volunteer field report',
  'an auto-snapped block is attributed with a volunteer-report reason'
);

-- 7. The optimal route reroutes around the auto-blocked edge (now through node 3).
select is(
  (select array_agg(node order by path_seq)
     from pgr_dijkstra(
       'select id, source, target, cost, reverse_cost from public.road_edges '
       'where id between 900000001 and 900000004', 1, 4, true)),
  array[1, 3, 4]::bigint[],
  'auto-snapping a located impassable report reroutes the optimal path around it'
);

select * from finish();
rollback;
