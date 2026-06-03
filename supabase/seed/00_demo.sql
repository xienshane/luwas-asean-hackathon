-- LUWAS — demo seed data (Phase 0.2)
--
-- Idempotent: safe to re-run (every insert uses ON CONFLICT DO NOTHING).
-- Gives the coordinator dashboard and volunteer PWA something to render and
-- provides loginable demo accounts for the walkthrough.
--
-- DEMO ONLY — these are not real people. Credentials:
--   coordinator@luwas.test / luwasdemo123   (role: coordinator)
--   juan@luwas.test        / luwasdemo123   (role: volunteer)
--   maria@luwas.test       / luwasdemo123   (role: volunteer)
--
-- Barangay centroids/populations below are approximate placeholders; real PSA
-- population and PostGIS boundaries arrive with the Phase 1.1 ingestion.

set search_path = public, extensions;

-- 1) Auth users (email/password). gen_crypt/bcrypt via pgcrypto. ------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'coordinator@luwas.test',
   crypt('luwasdemo123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   jsonb_build_object('display_name', 'Cebu Coordinator'), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'juan@luwas.test',
   crypt('luwasdemo123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   jsonb_build_object('display_name', 'Juan Dela Cruz'), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'maria@luwas.test',
   crypt('luwasdemo123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}',
   jsonb_build_object('display_name', 'Maria Santos'), now(), now())
on conflict do nothing;

-- 2) Email identities (gotrue requires one per user for password login). ----
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001',
                      'email', 'coordinator@luwas.test', 'email_verified', true),
   'email', now(), now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000002',
   jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000002',
                      'email', 'juan@luwas.test', 'email_verified', true),
   'email', now(), now(), now()),
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000003',
   jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000003',
                      'email', 'maria@luwas.test', 'email_verified', true),
   'email', now(), now(), now())
on conflict do nothing;

-- 3) Promote the coordinator; profiles were auto-created by handle_new_user.
--    Runs in seed context (auth.uid() is null) so the role guard allows it.
update public.profiles set role = 'coordinator', display_name = 'Cebu Coordinator'
 where id = 'a0000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Juan Dela Cruz'
 where id = 'a0000000-0000-0000-0000-000000000002';
update public.profiles set display_name = 'Maria Santos'
 where id = 'a0000000-0000-0000-0000-000000000003';

-- 4) A response team + the two volunteers (with PII + recorded consent). ----
insert into public.teams (id, name, capacity_kg, status) values
  ('b0000000-0000-0000-0000-000000000001', 'Team Sugbo', 1500, 'active')
on conflict do nothing;

insert into public.volunteers (id, full_name, phone, team_id, status, consent_at) values
  ('a0000000-0000-0000-0000-000000000002', 'Juan Dela Cruz', '+639170000002',
   'b0000000-0000-0000-0000-000000000001', 'active', now()),
  ('a0000000-0000-0000-0000-000000000003', 'Maria Santos', '+639170000003',
   'b0000000-0000-0000-0000-000000000001', 'active', now())
on conflict do nothing;

-- 5) Sample Cebu City barangays (approximate centroids). --------------------
insert into public.barangays (id, name, city_municipality, province, population, centroid) values
  ('c0000000-0000-0000-0000-000000000001', 'Lahug',        'Cebu City', 'Cebu', 25000, ST_SetSRID(ST_MakePoint(123.8980, 10.3340), 4326)),
  ('c0000000-0000-0000-0000-000000000002', 'Mabolo',       'Cebu City', 'Cebu', 22000, ST_SetSRID(ST_MakePoint(123.9120, 10.3180), 4326)),
  ('c0000000-0000-0000-0000-000000000003', 'Guadalupe',    'Cebu City', 'Cebu', 50000, ST_SetSRID(ST_MakePoint(123.8800, 10.3110), 4326)),
  ('c0000000-0000-0000-0000-000000000004', 'Banilad',      'Cebu City', 'Cebu', 12000, ST_SetSRID(ST_MakePoint(123.9120, 10.3380), 4326)),
  ('c0000000-0000-0000-0000-000000000005', 'Apas',         'Cebu City', 'Cebu', 15000, ST_SetSRID(ST_MakePoint(123.9070, 10.3370), 4326)),
  ('c0000000-0000-0000-0000-000000000006', 'Capitol Site', 'Cebu City', 'Cebu',  8000, ST_SetSRID(ST_MakePoint(123.8910, 10.3150), 4326)),
  ('c0000000-0000-0000-0000-000000000007', 'Tisa',         'Cebu City', 'Cebu', 30000, ST_SetSRID(ST_MakePoint(123.8700, 10.3000), 4326)),
  ('c0000000-0000-0000-0000-000000000008', 'Talamban',     'Cebu City', 'Cebu', 40000, ST_SetSRID(ST_MakePoint(123.9130, 10.3760), 4326))
on conflict do nothing;
