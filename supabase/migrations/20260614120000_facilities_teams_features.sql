-- LUWAS — Phase 4.1a: facilities (depot + map hubs), team operational columns,
-- and the province impact-feature view (TabPFN inputs derived from HDX).
set search_path = public, extensions;

-- 1 ─ facilities: real Cebu relief logistics points. Doubles as the OR-Tools
--     depot (is_depot) and the coordinator-map hub layer. Replaces mockLocationHubs.
create table if not exists public.facilities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'staging'
             check (kind in ('depot', 'warehouse', 'staging', 'shelter')),
  geom       geometry(Point, 4326) not null,
  is_depot   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists facilities_geom_idx on public.facilities using gist (geom);

-- Only one row may be the depot (partial unique index).
create unique index if not exists facilities_one_depot_idx
  on public.facilities ((true)) where is_depot;

comment on table public.facilities is
  'Real Cebu relief logistics points: routing depot + coordinator-map hubs. Coordinator-editable.';

grant select on public.facilities to authenticated;
grant all    on public.facilities to service_role;

alter table public.facilities enable row level security;
drop policy if exists facilities_read on public.facilities;
create policy facilities_read on public.facilities
  for select to authenticated using (true);
drop policy if exists facilities_write_coordinator on public.facilities;
create policy facilities_write_coordinator on public.facilities
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

-- security_invoker view exposing lat/lng (PostgREST cannot call ST_X/ST_Y inline).
create or replace view public.coordinator_facilities
with (security_invoker = true) as
  select id, name, kind, is_depot,
         st_y(geom) as latitude,
         st_x(geom) as longitude
    from public.facilities;
grant select on public.coordinator_facilities to authenticated;

-- ===== A2/A3 APPEND BELOW THIS LINE =====

-- 2 ─ teams: vehicle type + ensure base_location for routing.
alter table public.teams
  add column if not exists type text not null default '4x4'
    check (type in ('truck', '4x4', 'boat', 'ambulance'));

create or replace view public.coordinator_teams
with (security_invoker = true) as
  select t.id, t.name, t.capacity_kg, t.status, t.type,
         st_y(t.base_location) as base_lat,
         st_x(t.base_location) as base_lng
    from public.teams t;
grant select on public.coordinator_teams to authenticated;
