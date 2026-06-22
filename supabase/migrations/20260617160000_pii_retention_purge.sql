-- LUWAS — Phase 6.2: PII retention purge (precise volunteer GPS)
--
-- Data Privacy Act of 2012 (RA 10173) §11(e): personal data must be retained
-- "no longer than necessary." Precise volunteer GPS (volunteers.last_location)
-- is the most sensitive PII we hold, so it is purged on a retention window.
--
-- Policy (Phase 6.2 decision): purge the last precise position once it is older
-- than RETENTION_DAYS = 7. The platform already keeps only the LATEST fix per
-- volunteer (the update RPC overwrites in place — no GPS history), so this purge
-- removes a *stale* last-known position for a volunteer who has gone quiet.
--
-- Field-report coordinates are deliberately NOT touched here: a field report is
-- the operational record of a need at a barangay and is retained as such.
--
-- The function is SECURITY DEFINER + service_role-only and writes an audit row
-- per run (RA 10173 §21 accountability), so every purge is verifiable.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Audit log: one row per purge run (accountability / verifiability)
-- ---------------------------------------------------------------------------
create table if not exists public.pii_retention_runs (
  id             bigserial primary key,
  ran_at         timestamptz not null default now(),
  retention_days integer     not null,
  gps_purged     integer     not null default 0
);
comment on table public.pii_retention_runs is
  'Audit trail of PII retention purges (RA 10173 accountability). Coordinator-readable.';

alter table public.pii_retention_runs enable row level security;

-- Coordinators may review the purge history; no one but the function writes it.
drop policy if exists pii_retention_runs_read_coordinator on public.pii_retention_runs;
create policy pii_retention_runs_read_coordinator on public.pii_retention_runs
  for select to authenticated
  using ((select public.is_coordinator()));

-- ---------------------------------------------------------------------------
-- 2. Purge function: null precise GPS older than the retention window
-- ---------------------------------------------------------------------------
create or replace function public.purge_stale_volunteer_gps(retention_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - make_interval(days => retention_days);
  purged integer;
begin
  -- Clear the precise point (and its timestamp) for any volunteer whose last
  -- fix is older than the window, or whose fix has no timestamp to age (treated
  -- as stale, the privacy-protective default). PII-minimal: only the geometry
  -- and its time are cleared; the volunteer row and non-GPS data remain.
  update public.volunteers
     set last_location    = null,
         last_location_at = null
   where last_location is not null
     and (last_location_at is null or last_location_at < cutoff);
  get diagnostics purged = row_count;

  insert into public.pii_retention_runs (retention_days, gps_purged)
  values (retention_days, purged);

  return purged;
end;
$$;
comment on function public.purge_stale_volunteer_gps(integer) is
  'Nulls precise volunteer GPS older than retention_days (default 7); audits the run. RA 10173 §11(e).';

-- Trigger/cron-invoked only; not a public RPC endpoint.
revoke execute on function public.purge_stale_volunteer_gps(integer) from public;
grant  execute on function public.purge_stale_volunteer_gps(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Schedule the daily purge (idempotent)
-- ---------------------------------------------------------------------------
select cron.unschedule('purge-stale-volunteer-gps-daily')
 where exists (select 1 from cron.job where jobname = 'purge-stale-volunteer-gps-daily');

select cron.schedule(
  'purge-stale-volunteer-gps-daily',
  '0 3 * * *',                                     -- 03:00 daily
  $cron$select public.purge_stale_volunteer_gps(7);$cron$
);
