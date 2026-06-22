-- Phase 3.2–3.4 DB acceptance tests (pgTAP).
--
-- Run with:  supabase test db
-- or:        psql "$DATABASE_URL" -f supabase/tests/database/volunteer_pwa_realtime_test.sql
-- (needs `create extension if not exists pgtap;` once on the target DB).
-- Whole file is one transaction and rolls back — leaves no fixtures behind.
--
-- Proves:
--   * field_reports carries the offline-sync metadata columns.
--   * A volunteer can update (last-write-wins replay) their OWN report, via RLS.
--   * barangay_directory view exists (centroid lat/lng for forms, SMS geocode, pins).
--   * update_volunteer_position() upserts the caller's row and only theirs.
--   * RLS: a volunteer cannot read another volunteer's position; coordinator reads all.
--   * field_reports and volunteer_positions are in the supabase_realtime publication.

begin;
set search_path = public, extensions, pg_temp;

select plan(11);

-- Fixtures: one coordinator, two volunteers (profiles auto-created by trigger).
insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000001', 'coord.32@luwas.test'),
  ('20000000-0000-0000-0000-000000000002', 'vol.a.32@luwas.test'),
  ('20000000-0000-0000-0000-000000000003', 'vol.b.32@luwas.test');

update public.profiles set role = 'coordinator'
 where id = '20000000-0000-0000-0000-000000000001';

insert into public.volunteers (id, full_name) values
  ('20000000-0000-0000-0000-000000000002', 'Vol A'),
  ('20000000-0000-0000-0000-000000000003', 'Vol B');

-- 1–2: offline-sync metadata columns exist
select has_column('public', 'field_reports', 'captured_at',
  'field_reports.captured_at exists');
select has_column('public', 'field_reports', 'offline_synced',
  'field_reports.offline_synced exists');

-- 3: directory view exists
select has_view('public', 'barangay_directory', 'barangay_directory view exists');

-- 4: realtime publication contains both tables
select is(
  (select count(*)::int from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('field_reports', 'volunteer_positions')),
  2, 'supabase_realtime publishes field_reports + volunteer_positions');

-- As Volunteer A ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

-- 5–6: RPC publishes A's own position
select lives_ok(
  $$select public.update_volunteer_position(10.3157, 123.8854)$$,
  'volunteer can publish their own position');
select is(
  (select count(*)::int from public.volunteer_positions
    where volunteer_id = '20000000-0000-0000-0000-000000000002'),
  1, 'position row upserted for the caller');

-- 7–8: volunteer can insert AND update (replay) their own report
select lives_ok(
  $$insert into public.field_reports (id, reporter_id, source, raw_text, captured_at)
    values ('20000000-0000-0000-0000-0000000000f1',
            '20000000-0000-0000-0000-000000000002', 'app', 'first write', now())$$,
  'volunteer inserts own report');
select lives_ok(
  $$update public.field_reports set raw_text = 'second write'
    where id = '20000000-0000-0000-0000-0000000000f1'$$,
  'volunteer updates (last-write-wins) own report');

reset role;

-- Seed B's position from the privileged context (bypasses RLS).
insert into public.volunteer_positions (volunteer_id, lat, lng)
values ('20000000-0000-0000-0000-000000000003', 10.30, 123.88);

-- 9: A cannot see B's position
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.volunteer_positions
    where volunteer_id = '20000000-0000-0000-0000-000000000003'),
  0, 'RLS hides another volunteer''s position');
reset role;

-- 10–11: coordinator reads all positions and the last write won
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.volunteer_positions),
  2, 'coordinator reads all volunteer positions');
select is(
  (select raw_text from public.field_reports
    where id = '20000000-0000-0000-0000-0000000000f1'),
  'second write', 'replayed write overwrote the first (last write wins)');
reset role;

select * from finish();
rollback;
