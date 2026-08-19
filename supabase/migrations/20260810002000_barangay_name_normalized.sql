-- S10: match place names without diacritics.
--
-- SEA-LION returns the location romanized: the Vietnamese preset
--   "Ngập lụt nặng ở phường An Hải, Đà Nẵng"
-- yields location_text "An Hai Ward, Da Nang". Matching that against the stored
-- "Phường An Hải" fails on every pattern, so a correctly parsed report was landing
-- flagged for want of five accents.
--
-- Fix: store a folded form of the name and match against that. The client folds the
-- query the same way (NFD + strip combining marks), so both sides meet as plain ASCII.
--
-- unaccent() is only STABLE (it depends on a dictionary), so it cannot be used in a
-- generated column directly. The two-argument form names the dictionary explicitly,
-- which makes the result reproducible and safe to wrap as IMMUTABLE — the standard
-- approach for indexing unaccented text.

create extension if not exists unaccent with schema extensions;

create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
set search_path = extensions, pg_temp
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

comment on function public.immutable_unaccent(text) is
  'Diacritic-folding wrapper over unaccent(), pinned to a named dictionary so it is IMMUTABLE and therefore indexable.';

alter table public.barangays
  add column if not exists name_normalized text
  generated always as (lower(public.immutable_unaccent(name))) stored;

comment on column public.barangays.name_normalized is
  'Lowercased, diacritic-free name. SMS geocoding matches against this, never `name`.';

-- Lookups are `ilike '%needle%'`, which a btree cannot serve; trigram can.
create extension if not exists pg_trgm with schema extensions;
create index if not exists barangays_name_normalized_trgm_idx
  on public.barangays using gin (name_normalized extensions.gin_trgm_ops);

-- Expose it to the geocoder. Appended LAST: `create or replace view` cannot insert
-- a column mid-list.
create or replace view public.barangay_directory
with (security_invoker = true) as
  select b.id,
         b.name,
         b.city_municipality,
         b.population,
         st_y(b.centroid) as lat,
         st_x(b.centroid) as lng,
         b.region,
         b.name_normalized
    from public.barangays b
   where b.centroid is not null;

comment on view public.barangay_directory is
  'Barangay names + centroid lat/lng for forms, SMS geocoding, and map pins. security_invoker: barangays RLS applies.';

grant select on public.barangay_directory to authenticated, service_role;
