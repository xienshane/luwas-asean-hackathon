-- LUWAS — Phase 4.1 operational seed (idempotent). Single Cebu logistics hub.
set search_path = public, extensions;

-- Single logistics hub: A.B Hub Cebu (Angelica Bldg, Osmeña Blvd, Cebu City, 6000).
-- Doubles as the OR-Tools depot and the only coordinator-map hub.
insert into public.facilities (id, name, kind, geom, is_depot) values
  ('d0000000-0000-0000-0000-000000000001', 'A.B Hub Cebu', 'depot',
     ST_SetSRID(ST_MakePoint(123.89209, 10.31307), 4326), true)
on conflict (id) do nothing;

-- Response teams, all based at the hub. Existing Team Sugbo gets a base + type.
update public.teams
   set base_location = (select geom from public.facilities where is_depot limit 1),
       type = '4x4'
 where name = 'Team Sugbo';

insert into public.teams (id, name, capacity_kg, status, type, base_location) values
  ('b0000000-0000-0000-0000-000000000002', 'Logistics Truck 1', 5000, 'idle', 'truck',
     (select geom from public.facilities where is_depot limit 1)),
  ('b0000000-0000-0000-0000-000000000003', 'Water Rescue Boat 1', 800, 'idle', 'boat',
     (select geom from public.facilities where is_depot limit 1)),
  ('b0000000-0000-0000-0000-000000000004', 'Medic Ambulance 1', 400, 'idle', 'ambulance',
     (select geom from public.facilities where is_depot limit 1))
on conflict (id) do nothing;
