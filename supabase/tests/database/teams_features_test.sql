begin;
select plan(5);

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

select ok(
  (select province_housing_units from public.province_impact_features
     where province = 'Cebu') = 1058512,
  'Cebu province_housing_units matches HDX-derived value'
);
select ok(
  (select round(structural_vuln_frac::numeric, 4) from public.province_impact_features
     where province = 'Cebu') = 0.3950,
  'Cebu structural_vuln_frac matches HDX-derived value'
);

select * from finish();
rollback;
