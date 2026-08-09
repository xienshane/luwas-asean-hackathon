-- LUWAS — depot stock: what is actually on hand at a logistics facility.
--
-- The Sphere engine produces *need*; this table is *supply*. The coordinator UI reads the
-- two together so a manifest line shows coverage (on-hand vs required) instead of a bare
-- requirement. Without a row here a line reads 0 on hand — which is honest, not a bug.
set search_path = public, extensions;

create table if not exists public.facility_stock (
  facility_id uuid not null references public.facilities (id) on delete cascade,
  -- Matches the manifest line keys the UI renders. Kept as a check constraint rather than
  -- an enum so adding a relief item is a one-line migration, not a type rewrite.
  item_key    text not null
              check (item_key in ('water_l', 'food_packs', 'shelter_kits',
                                  'blankets', 'hygiene_kits', 'medical_kits')),
  quantity    numeric(12, 2) not null default 0 check (quantity >= 0),
  updated_at  timestamptz not null default now(),
  primary key (facility_id, item_key)
);

comment on table public.facility_stock is
  'On-hand relief stock per facility per item. Coordinator-editable; drives manifest coverage.';

grant select on public.facility_stock to authenticated;
grant all    on public.facility_stock to service_role;

alter table public.facility_stock enable row level security;
drop policy if exists facility_stock_read on public.facility_stock;
create policy facility_stock_read on public.facility_stock
  for select to authenticated using (true);
drop policy if exists facility_stock_write_coordinator on public.facility_stock;
create policy facility_stock_write_coordinator on public.facility_stock
  for all to authenticated
  using ((select public.is_coordinator()))
  with check ((select public.is_coordinator()));

-- Province-wide pool the coordinator dispatches from: every depot's stock, one row per
-- item. Today that is the single A.B Hub Cebu row; the sum keeps the contract stable if a
-- second depot is ever added.
create or replace view public.coordinator_depot_stock
with (security_invoker = true) as
  select s.item_key,
         sum(s.quantity)::numeric(12, 2) as quantity
    from public.facility_stock s
    join public.facilities f on f.id = s.facility_id
   where f.is_depot
   group by s.item_key;
grant select on public.coordinator_depot_stock to authenticated;
