-- LUWAS — Phases 3.2–3.4: volunteer PWA offline sync, SMS intake support,
-- realtime volunteer positions.
--
-- 1. field_reports gains offline-capture metadata (captured_at: device time at
--    submit; offline_synced: coordinator-visible "arrived late via Background
--    Sync" flag) and an update-own policy so queued submissions can be replayed
--    as idempotent upserts on the client-generated id (last write wins).
-- 2. barangay_directory: a security_invoker view exposing barangay names +
--    centroid lat/lng for the volunteer form, SMS geocoding, and live map pins
--    (PostgREST cannot call ST_X/ST_Y inline; RLS still applies through the view).
-- 3. volunteer_positions: latest-only, PII-minimized GPS (one row per volunteer,
--    no history, no name/phone in the realtime payload) + the
--    update_volunteer_position() RPC volunteers call from the PWA. Consent is
--    enforced in the UI (volunteers.consent_at); retention/purge is Phase 6.2.
-- 4. Adds field_reports + volunteer_positions to the supabase_realtime
--    publication (idempotent; creates the publication if absent so the pgTAP
--    suite also passes on vanilla Postgres).

set search_path = public, extensions;

-- 1 ─ field_reports: offline-sync metadata + last-write-wins replay ----------
alter table public.field_reports
  add column if not exists captured_at timestamptz,
  add column if not exists offline_synced boolean not null default false;

comment on column public.field_reports.captured_at is
  'Device time when the volunteer hit submit (created_at is server insert time).';
comment on column public.field_reports.offline_synced is
  'True when the report arrived via Background Sync well after capture — coordinator-visible flag.';

drop policy if exists field_reports_update_own on public.field_reports;
create policy field_reports_update_own on public.field_reports
  for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

-- 2 ─ barangay directory view -------------------------------------------------
create or replace view public.barangay_directory
with (security_invoker = true) as
  select b.id,
         b.name,
         b.city_municipality,
         b.population,
         st_y(b.centroid) as lat,
         st_x(b.centroid) as lng
    from public.barangays b
   where b.centroid is not null;

comment on view public.barangay_directory is
  'Barangay names + centroid lat/lng for forms, SMS geocoding, and map pins. security_invoker: barangays RLS applies.';

grant select on public.barangay_directory to authenticated, service_role;

-- 3 ─ volunteer_positions + RPC -------------------------------------------------
create table if not exists public.volunteer_positions (
  volunteer_id uuid primary key references public.volunteers (id) on delete cascade,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  recorded_at  timestamptz not null default now()
);
comment on table public.volunteer_positions is
  'PII: current (latest-only) volunteer GPS. Consent-gated in the UI; retention-bound (Phase 6.2 purge).';

grant select, insert, update on public.volunteer_positions to authenticated;
grant all on public.volunteer_positions to service_role;

alter table public.volunteer_positions enable row level security;

drop policy if exists volunteer_positions_select on public.volunteer_positions;
create policy volunteer_positions_select on public.volunteer_positions
  for select to authenticated
  using (volunteer_id = (select auth.uid()) or (select public.is_coordinator()));

drop policy if exists volunteer_positions_insert_own on public.volunteer_positions;
create policy volunteer_positions_insert_own on public.volunteer_positions
  for insert to authenticated
  with check (volunteer_id = (select auth.uid()));

drop policy if exists volunteer_positions_update_own on public.volunteer_positions;
create policy volunteer_positions_update_own on public.volunteer_positions
  for update to authenticated
  using (volunteer_id = (select auth.uid()))
  with check (volunteer_id = (select auth.uid()));

-- Upserts the caller's position and mirrors it into the Phase 0.2 canonical
-- PII columns. SECURITY INVOKER: every write passes the RLS policies above.
create or replace function public.update_volunteer_position(
  p_lat double precision,
  p_lng double precision
) returns void
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.volunteer_positions (volunteer_id, lat, lng, recorded_at)
  values ((select auth.uid()), p_lat, p_lng, now())
  on conflict (volunteer_id) do update
    set lat = excluded.lat,
        lng = excluded.lng,
        recorded_at = excluded.recorded_at;

  update public.volunteers
     set last_location    = st_setsrid(st_makepoint(p_lng, p_lat), 4326),
         last_location_at = now()
   where id = (select auth.uid());
end;
$$;

revoke execute on function public.update_volunteer_position(double precision, double precision) from public;
grant  execute on function public.update_volunteer_position(double precision, double precision) to authenticated;

-- 4 ─ realtime publication ------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'field_reports') then
    alter publication supabase_realtime add table public.field_reports;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'volunteer_positions') then
    alter publication supabase_realtime add table public.volunteer_positions;
  end if;
end $$;
