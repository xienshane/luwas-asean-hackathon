begin;
select plan(7);

select has_view('public', 'coordinator_routes', 'coordinator_routes exists');
select has_view('public', 'coordinator_impact_predictions', 'coordinator_impact_predictions exists');
select has_view('public', 'coordinator_supply_manifests', 'coordinator_supply_manifests exists');
select has_view('public', 'coordinator_road_status', 'coordinator_road_status exists');
select has_view('public', 'coordinator_volunteers', 'coordinator_volunteers exists');

select has_function('public', 'pipeline_targets', 'pipeline_targets function exists');

-- publication contains the 3 pipeline tables
select ok(
  (select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('impact_predictions','supply_manifests','routes')) = 3,
  'impact_predictions, supply_manifests, routes are on supabase_realtime'
);

select * from finish();
rollback;
