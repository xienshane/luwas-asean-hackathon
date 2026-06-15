begin;
select plan(4);

select has_table('public', 'facilities', 'facilities table exists');
select ok(
  (select count(*) from public.facilities) >= 4,
  'at least 4 real facilities seeded'
);
select ok(
  (select count(*) from public.facilities where is_depot) = 1,
  'exactly one depot is flagged'
);
select ok(
  (select count(*) from public.coordinator_facilities
     where latitude between 9.5 and 11.5 and longitude between 123.0 and 124.5) >= 4,
  'coordinator_facilities exposes lat/lng inside the Cebu bbox'
);

select * from finish();
rollback;
