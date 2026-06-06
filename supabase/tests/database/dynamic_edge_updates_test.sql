-- pgRouting dynamic-edge-update acceptance tests for Phase 2.6 (pgTAP).
--
-- Run with the Supabase CLI:  supabase test db
-- (or execute against a database with the pgtap + pgrouting extensions enabled).
--
-- Acceptance criteria proven here:
--   * Flagging a road segment impassable (a field_reports row) raises the matching
--     road_edges cost/reverse_cost to the sentinel, and the OPTIMAL pgr_dijkstra route
--     reroutes around it.
--   * The real cost is preserved (original_cost) and repeat flags never clobber it.
--   * Clearing the flag (set_edge_impassable(.., false)) restores the cost and the route
--     returns to the cheap path. No external API is used (pure DB).
--
-- The whole file runs in one transaction and rolls back, leaving no fixtures behind.

begin;
set search_path = public, extensions, pg_temp;

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixture: a 4-node diamond from node 1 to node 4 with two paths.
--   cheap path : 1 --(e1, cost 1)--> 2 --(e2, cost 1)--> 4   (total 2)
--   detour     : 1 --(e3, cost 5)--> 3 --(e4, cost 5)--> 4   (total 10)
-- Edges are bidirectional (reverse_cost = cost). High explicit ids isolate the test
-- subgraph from any real imported road_edges. geom is unused by pgr_dijkstra.
-- ---------------------------------------------------------------------------
insert into public.road_edges (id, source, target, cost, reverse_cost) values
  (900000001, 1, 2, 1, 1),
  (900000002, 2, 4, 1, 1),
  (900000003, 1, 3, 5, 5),
  (900000004, 3, 4, 5, 5);

-- 1. Baseline: the cheapest 1->4 route goes through node 2.
select is(
  (select array_agg(node order by path_seq)
     from pgr_dijkstra(
       'select id, source, target, cost, reverse_cost from public.road_edges '
       'where id between 900000001 and 900000004', 1, 4, true)),
  array[1, 2, 4]::bigint[],
  'baseline: cheapest 1->4 route runs through node 2'
);

-- Flag edge e1 (1->2) impassable via a volunteer field report (fires the trigger).
insert into public.field_reports (source, road_status, road_impassable, impassable_edge_id, status)
values ('app', 'impassable', true, 900000001, 'pending');

-- 2. The flagged edge is now blocked with a very high cost.
select ok(
  (select impassable and cost >= 1e9 from public.road_edges where id = 900000001),
  'flagging a report sets the matching edge impassable with a very high cost'
);

-- 3. The optimal route reroutes around the blocked edge (through node 3).
select is(
  (select array_agg(node order by path_seq)
     from pgr_dijkstra(
       'select id, source, target, cost, reverse_cost from public.road_edges '
       'where id between 900000001 and 900000004', 1, 4, true)),
  array[1, 3, 4]::bigint[],
  'flagging a segment reroutes the optimal path around it (now through node 3)'
);

-- A second volunteer flags the same edge — must NOT clobber the preserved baseline.
insert into public.field_reports (source, road_impassable, impassable_edge_id, status)
values ('app', true, 900000001, 'pending');

-- 4. The real cost is still preserved for restoration (idempotent block).
select ok(
  (select original_cost = 1 and original_reverse_cost = 1
     from public.road_edges where id = 900000001),
  'repeat flags preserve the original cost (idempotent block)'
);

-- Coordinator clears the flag.
select public.set_edge_impassable(900000001, false);

-- 5. The route returns to the cheap path through node 2.
select is(
  (select array_agg(node order by path_seq)
     from pgr_dijkstra(
       'select id, source, target, cost, reverse_cost from public.road_edges '
       'where id between 900000001 and 900000004', 1, 4, true)),
  array[1, 2, 4]::bigint[],
  'clearing the flag restores the road and the route returns to the cheap path'
);

-- 6. The edge state is fully restored.
select ok(
  (select not impassable and cost = 1 and original_cost is null
     from public.road_edges where id = 900000001),
  'clearing restores cost from original_cost and resets the impassable flag'
);

select * from finish();
rollback;
