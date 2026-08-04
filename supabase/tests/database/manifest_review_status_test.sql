-- LUWAS — persisted coordinator review status on supply manifests.
-- Run with the Supabase CLI:  supabase test db
-- (or execute against a database that has the pgtap extension enabled).
begin;
select plan(5);

select has_column('public', 'supply_manifests', 'status', 'supply_manifests.status exists');
select has_column('public', 'coordinator_supply_manifests', 'status', 'coordinator view exposes status');

-- A manifest starts life awaiting review.
insert into public.supply_manifests (barangay_id, days, water_l, food_packs)
  select id, 3, 100, 10 from public.barangays limit 1;
select is(
  (select status from public.supply_manifests order by created_at desc limit 1),
  'pending',
  'new manifests default to pending'
);

-- The four review states are the only ones allowed.
select lives_ok(
  $$update public.supply_manifests set status = 'approved'
      where id = (select id from public.supply_manifests order by created_at desc limit 1)$$,
  'approved is an accepted review state'
);
select throws_ok(
  $$update public.supply_manifests set status = 'maybe'
      where id = (select id from public.supply_manifests order by created_at desc limit 1)$$,
  '23514',
  null,
  'an unknown review state is rejected by the check constraint'
);

select * from finish();
rollback;
