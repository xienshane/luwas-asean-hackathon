-- PII retention purge acceptance tests for Phase 6.2 (pgTAP).
--
-- Run with the Supabase CLI:  supabase test db
-- or:  psql "$DATABASE_URL" -f supabase/tests/database/pii_retention_test.sql
-- (needs `create extension if not exists pgtap;` once on the target DB).
--
-- Acceptance criteria proven here:
--   * purge_stale_volunteer_gps() nulls precise GPS older than the window.
--   * A recent position (inside the window) is preserved.
--   * The function returns the count of rows purged.
--   * Each run writes an audit row (RA 10173 accountability).
--   * Only the precise GPS is cleared — the volunteer row + non-GPS data remain.
--
-- The whole file runs inside one transaction and rolls back, so it never leaves
-- fixtures behind and never disturbs production data.

begin;
set search_path = public, extensions, pg_temp;

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures: two volunteers with a precise last_location.
--   STALE — last fix 8 days ago  (older than the 7-day window -> purged)
--   FRESH — last fix 1 day ago   (inside the window           -> preserved)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-000000000001', 'vol.stale.62@luwas.test'),
  ('60000000-0000-0000-0000-000000000002', 'vol.fresh.62@luwas.test');

insert into public.volunteers (id, full_name, phone, last_location, last_location_at) values
  ('60000000-0000-0000-0000-000000000001', 'Stale Vol', '+639170000061',
     st_setsrid(st_makepoint(123.88, 10.31), 4326), now() - interval '8 days'),
  ('60000000-0000-0000-0000-000000000002', 'Fresh Vol', '+639170000062',
     st_setsrid(st_makepoint(123.90, 10.32), 4326), now() - interval '1 day');

-- ---------------------------------------------------------------------------
-- Run the purge with the default 7-day window.
-- ---------------------------------------------------------------------------
select is(
  public.purge_stale_volunteer_gps(7),
  1,
  'purge returns 1 (only the stale position is purged)');

-- 2: the stale volunteer's precise GPS is gone
select is(
  (select last_location is null and last_location_at is null
     from public.volunteers
    where id = '60000000-0000-0000-0000-000000000001'),
  true,
  'stale volunteer GPS (location + timestamp) is nulled');

-- 3: the fresh volunteer's precise GPS is preserved
select is(
  (select last_location is not null
     from public.volunteers
    where id = '60000000-0000-0000-0000-000000000002'),
  true,
  'fresh volunteer GPS (inside window) is preserved');

-- 4: only GPS was cleared — non-PII-GPS columns on the stale row remain intact
select is(
  (select full_name from public.volunteers
    where id = '60000000-0000-0000-0000-000000000001'),
  'Stale Vol',
  'purge clears only GPS; the volunteer row + other fields remain');

-- 5: an audit row was written for the run
select is(
  (select gps_purged from public.pii_retention_runs
    order by ran_at desc limit 1),
  1,
  'purge writes an audit row recording the rows purged');

-- 6: a second run is a no-op (idempotent on already-purged data)
select is(
  public.purge_stale_volunteer_gps(7),
  0,
  'a second purge finds nothing stale and returns 0');

select * from finish();
rollback;
