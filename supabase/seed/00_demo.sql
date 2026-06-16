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

-- GoTrue scans these token columns into Go strings; a NULL (which a direct SQL
-- insert leaves behind, unlike the Auth API which writes '') makes login fail
-- with "Database error querying schema". Normalise any NULLs to empty string.
update auth.users
set confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change               = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, '')
 where id in ('a0000000-0000-0000-0000-000000000001',
              'a0000000-0000-0000-0000-000000000002',
              'a0000000-0000-0000-0000-000000000003');

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

-- 5) Cebu City barangays now come from the real OSM-boundary ingest
--    (data-pipeline/ingest_static.py -> public.barangays, 80 barangays under
--    'Cebu City (Capital)' with geom + PSA population). The earlier 8 synthetic
--    geomless demo rows (c0000000-…-0001..0008) duplicated those real barangays
--    and could never be scored (silent_area_score requires geom), so they were
--    dropped. Nothing references their IDs (field_reports use real barangay_ids).
