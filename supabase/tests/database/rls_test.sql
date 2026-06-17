-- RLS / RBAC acceptance tests for Phase 0.2 (pgTAP).
--
-- Run with the Supabase CLI:  supabase test db
-- (or execute against a database that has the pgtap extension enabled).
--
-- Acceptance criteria proven here:
--   * RLS blocks a volunteer from reading another volunteer's PII — both phone
--     AND precise GPS (last_location), the most sensitive PII we hold (Phase 6.2).
--   * A volunteer CAN read their own PII.
--   * The coordinator can read aggregates (all volunteer rows).
--   * The role helpers (is_coordinator / current_app_role) resolve correctly.
--
-- The whole file runs inside one transaction and rolls back, so it never
-- leaves fixtures behind.

begin;
set search_path = public, extensions, pg_temp;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixtures: three auth users -> profiles created by the handle_new_user
-- trigger. One is promoted to coordinator; two stay volunteers with PII.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coordinator@luwas.test'),
  ('00000000-0000-0000-0000-000000000002', 'volunteer.a@luwas.test'),
  ('00000000-0000-0000-0000-000000000003', 'volunteer.b@luwas.test');

update public.profiles
   set role = 'coordinator'
 where id = '00000000-0000-0000-0000-000000000001';

insert into public.volunteers (id, full_name, phone, last_location, last_location_at) values
  ('00000000-0000-0000-0000-000000000002', 'Volunteer A', '+639170000002',
     st_setsrid(st_makepoint(123.88, 10.31), 4326), now()),
  ('00000000-0000-0000-0000-000000000003', 'Volunteer B', '+639170000003',
     st_setsrid(st_makepoint(123.90, 10.32), 4326), now());

-- ---------------------------------------------------------------------------
-- Role helpers, evaluated as the coordinator.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is( public.is_coordinator(), true,
  'is_coordinator() is true for a coordinator' );
select is( public.current_app_role(), 'coordinator'::public.app_role,
  'current_app_role() returns coordinator for a coordinator' );

reset role;

-- ---------------------------------------------------------------------------
-- Volunteer A: cannot see Volunteer B's PII, can see their own, is not coord.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is( public.is_coordinator(), false,
  'is_coordinator() is false for a volunteer' );

select is_empty(
  $$ select phone from public.volunteers
       where id = '00000000-0000-0000-0000-000000000003' $$,
  'volunteer A is blocked from reading volunteer B PII (phone)' );

select is_empty(
  $$ select last_location from public.volunteers
       where id = '00000000-0000-0000-0000-000000000003' $$,
  'volunteer A is blocked from reading volunteer B precise GPS (last_location)' );

select isnt_empty(
  $$ select phone from public.volunteers
       where id = '00000000-0000-0000-0000-000000000002' $$,
  'volunteer A can read their own PII' );

reset role;

-- ---------------------------------------------------------------------------
-- Coordinator: can read aggregates (all volunteer rows).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.volunteers),
  2,
  'coordinator can read all volunteer rows (aggregates)' );

reset role;

select * from finish();
rollback;
