begin;
select plan(3);

select has_column('public', 'teams', 'type', 'teams has a vehicle type column');
select ok(
  (select count(*) from public.teams where base_location is not null) >= 3,
  'at least 3 teams seeded with a depot base_location'
);
select ok(
  (select count(*) from public.coordinator_teams
     where base_lat is not null and base_lng is not null) >= 3,
  'coordinator_teams exposes base lat/lng'
);

select * from finish();
rollback;
