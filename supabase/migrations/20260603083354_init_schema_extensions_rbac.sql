-- LUWAS — Phase 0.2: schema + extensions + RBAC
--
-- Creates the core LUWAS schema, the spatial/routing extensions, the
-- coordinator/volunteer role model, and row-level security so that PII is
-- readable only by its owner and coordinators.
--
-- Model: profiles (1:1 with auth.users) is the canonical role source; the
-- volunteers table extends a profile with volunteer-only PII. AI services and
-- the data pipeline connect with the service_role key, which bypasses RLS, so
-- the policies below only govern the web app's `authenticated` users.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Extensions (spatial + routing + scheduler) in the extensions schema
-- ---------------------------------------------------------------------------
create extension if not exists postgis    with schema extensions;
create extension if not exists pgrouting   with schema extensions cascade;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- 2. Role enum + identity
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('coordinator', 'volunteer');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.app_role not null default 'volunteer',
  display_name text,
  created_at   timestamptz not null default now()
);
comment on table public.profiles is
  'One row per auth user; canonical role source for RBAC.';

-- A new auth user gets a profile (role defaults to volunteer).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Role helpers (SECURITY DEFINER -> bypass profiles RLS, no recursion)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'coordinator'
  );
$$;

-- Block volunteers from escalating their own role; coordinators may set roles.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only restrain logged-in users. The service_role / admin / seed context has
  -- a null auth.uid() and is trusted to assign roles directly.
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not public.is_coordinator() then
    raise exception 'only coordinators can change a profile role';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- 4. Core tables
-- ---------------------------------------------------------------------------

-- teams (response teams / vehicles)
create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  capacity_kg   numeric(10, 2),
  base_location geometry(Point, 4326),
  status        text not null default 'active',
  created_at    timestamptz not null default now()
);

-- volunteers: profile extension holding volunteer-only PII
create table public.volunteers (
  id               uuid primary key references public.profiles (id) on delete cascade,
  full_name        text,
  phone            text,
  last_location    geometry(Point, 4326),
  last_location_at timestamptz,
  team_id          uuid references public.teams (id) on delete set null,
  status           text not null default 'active',
  consent_at       timestamptz,
  created_at       timestamptz not null default now()
);
comment on column public.volunteers.full_name     is 'PII';
comment on column public.volunteers.phone         is 'PII';
comment on column public.volunteers.last_location is 'PII: precise volunteer GPS';

-- barangays (reference data)
create table public.barangays (
  id                uuid primary key default gen_random_uuid(),
  psgc_code         text unique,
  name              text not null,
  city_municipality text,
  province          text,
  population        integer,
  geom              geometry(MultiPolygon, 4326),
  centroid          geometry(Point, 4326),
  created_at        timestamptz not null default now()
);
create index barangays_geom_idx on public.barangays using gist (geom);

-- road_edges: pgRouting-compatible edge table
create table public.road_edges (
  id                    bigserial primary key,
  source                bigint,
  target                bigint,
  cost                  double precision,
  reverse_cost          double precision,
  original_cost         double precision,
  original_reverse_cost double precision,
  osm_id                bigint,
  name                  text,
  length_m              double precision,
  impassable            boolean not null default false,
  geom                  geometry(LineString, 4326)
);
create index road_edges_source_idx on public.road_edges (source);
create index road_edges_target_idx on public.road_edges (target);
create index road_edges_geom_idx   on public.road_edges using gist (geom);

-- field_reports
create type public.report_source as enum ('app', 'sms', 'parsed');
create type public.report_status as enum ('pending', 'confirmed', 'flagged');

create table public.field_reports (
  id                  uuid primary key default gen_random_uuid(),
  barangay_id         uuid references public.barangays (id) on delete set null,
  reporter_id         uuid references public.profiles (id) on delete set null,
  source              public.report_source not null default 'app',
  raw_text            text,
  location            geometry(Point, 4326),
  population_estimate integer,
  needs_severity      text,
  road_status         text,
  road_impassable     boolean not null default false,
  impassable_edge_id  bigint references public.road_edges (id) on delete set null,
  confidence          numeric(4, 3),
  status              public.report_status not null default 'pending',
  created_at          timestamptz not null default now()
);
create index field_reports_location_idx on public.field_reports using gist (location);
create index field_reports_barangay_idx on public.field_reports (barangay_id);

-- impact_predictions
create table public.impact_predictions (
  id                 uuid primary key default gen_random_uuid(),
  barangay_id        uuid not null references public.barangays (id) on delete cascade,
  field_report_id    uuid references public.field_reports (id) on delete set null,
  model              text not null default 'tabpfn',
  predicted_affected integer,
  damage_severity    text,
  confidence         numeric(4, 3),
  inputs             jsonb,
  override_value     integer,
  overridden_by      uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index impact_predictions_barangay_idx on public.impact_predictions (barangay_id);

-- supply_manifests (deterministic Sphere output)
create table public.supply_manifests (
  id                   uuid primary key default gen_random_uuid(),
  barangay_id          uuid not null references public.barangays (id) on delete cascade,
  impact_prediction_id uuid references public.impact_predictions (id) on delete set null,
  days                 integer not null default 3,
  access_modifier      numeric(4, 2) not null default 1.0,
  water_l              numeric(12, 2),
  food_packs           numeric(12, 2),
  shelter_kits         numeric(12, 2),
  blankets             numeric(12, 2),
  breakdown            jsonb,
  overridden           boolean not null default false,
  created_at           timestamptz not null default now()
);
create index supply_manifests_barangay_idx on public.supply_manifests (barangay_id);

-- routes (OR-Tools output; stops as ordered JSONB)
create type public.route_status as enum ('planned', 'active', 'completed');

create table public.routes (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid references public.teams (id) on delete set null,
  status           public.route_status not null default 'planned',
  geom             geometry(LineString, 4326),
  total_distance_m double precision,
  stops            jsonb,
  created_at       timestamptz not null default now()
);
create index routes_geom_idx on public.routes using gist (geom);
create index routes_team_idx on public.routes (team_id);

-- ---------------------------------------------------------------------------
-- 5. Privileges (broad table grants; RLS narrows them below)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables    in schema public to authenticated;
grant all                          on all tables       in schema public to service_role;
grant usage, select                on all sequences    in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Row-level security
-- ---------------------------------------------------------------------------

-- profiles: read self or coordinator; update self (role change guarded);
--           coordinators manage all.
alter table public.profiles enable row level security;

create policy profiles_select_self_or_coordinator on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_coordinator()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_manage_coordinator on public.profiles
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

-- volunteers: read/update own row or coordinator; insert own; coordinator all.
alter table public.volunteers enable row level security;

create policy volunteers_select_self_or_coordinator on public.volunteers
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_coordinator()));

create policy volunteers_insert_self on public.volunteers
  for insert to authenticated
  with check (id = (select auth.uid()) or (select public.is_coordinator()));

create policy volunteers_update_self on public.volunteers
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_coordinator()))
  with check (id = (select auth.uid()) or (select public.is_coordinator()));

create policy volunteers_delete_coordinator on public.volunteers
  for delete to authenticated
  using ((select public.is_coordinator()));

-- teams: coordinator manages; a volunteer can read their own team.
alter table public.teams enable row level security;

create policy teams_select on public.teams
  for select to authenticated
  using (
    (select public.is_coordinator())
    or exists (
      select 1 from public.volunteers v
      where v.team_id = teams.id and v.id = (select auth.uid())
    )
  );

create policy teams_manage_coordinator on public.teams
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

-- field_reports: read/insert own; coordinator reads & manages all.
alter table public.field_reports enable row level security;

create policy field_reports_select on public.field_reports
  for select to authenticated
  using ((select public.is_coordinator()) or reporter_id = (select auth.uid()));

create policy field_reports_insert on public.field_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) or (select public.is_coordinator()));

create policy field_reports_manage_coordinator on public.field_reports
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

-- Reference data: any authenticated user reads; coordinators write.
alter table public.barangays enable row level security;
create policy barangays_read on public.barangays
  for select to authenticated using (true);
create policy barangays_write_coordinator on public.barangays
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

alter table public.road_edges enable row level security;
create policy road_edges_read on public.road_edges
  for select to authenticated using (true);
create policy road_edges_write_coordinator on public.road_edges
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

-- Coordinator-facing planning tables (AI writes via service_role bypass RLS).
alter table public.impact_predictions enable row level security;
create policy impact_predictions_coordinator on public.impact_predictions
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

alter table public.supply_manifests enable row level security;
create policy supply_manifests_coordinator on public.supply_manifests
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

alter table public.routes enable row level security;
create policy routes_coordinator on public.routes
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

-- ---------------------------------------------------------------------------
-- 7. Lock down SECURITY DEFINER helpers (not meant to be public RPC endpoints)
-- ---------------------------------------------------------------------------
-- Trigger functions run only via the trigger machinery; no role needs EXECUTE.
revoke execute on function public.handle_new_user()    from public;
revoke execute on function public.guard_profile_role() from public;

-- RLS helpers are needed during policy evaluation for signed-in users only.
revoke execute on function public.current_app_role() from public;
revoke execute on function public.is_coordinator()   from public;
grant  execute on function public.current_app_role() to authenticated, service_role;
grant  execute on function public.is_coordinator()   to authenticated, service_role;
