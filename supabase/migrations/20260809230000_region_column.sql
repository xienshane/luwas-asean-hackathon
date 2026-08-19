-- S10 (Da Nang scalability clip): tag every barangay with the region it belongs to.
--
-- LUWAS ships as a country pack: boundaries + population + language + channels, with
-- no model retraining. `region` is the seam that makes a second pack loadable beside
-- the first — Cebu and Da Nang share one schema, one scoring function, one road graph
-- table, and are told apart only by this column.
--
-- Existing rows are Cebu by definition, so the default backfills them.

alter table public.barangays
  add column if not exists region text not null default 'cebu';

comment on column public.barangays.region is
  'Country-pack this area belongs to (''cebu'', ''danang''). Filters map, feeds, and scoring scope.';

-- Every read path filters by region, so it leads the index.
create index if not exists barangays_region_idx on public.barangays (region);

-- The directory view backs SMS geocoding and map pins; both must resolve a name
-- within one region, or "Phường Hòa Cường" could match a Cebu barangay and vice versa.
create or replace view public.barangay_directory
with (security_invoker = true) as
  select b.id,
         b.name,
         b.city_municipality,
         b.population,
         st_y(b.centroid) as lat,
         st_x(b.centroid) as lng,
         -- appended last: `create or replace view` cannot insert a column mid-list.
         b.region
    from public.barangays b
   where b.centroid is not null;

comment on view public.barangay_directory is
  'Barangay names + centroid lat/lng for forms, SMS geocoding, and map pins. security_invoker: barangays RLS applies.';

grant select on public.barangay_directory to authenticated, service_role;
