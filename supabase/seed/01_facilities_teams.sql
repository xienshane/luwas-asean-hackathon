-- LUWAS — Phase 4.1 operational seed (idempotent). Real Cebu logistics points.
set search_path = public, extensions;

insert into public.facilities (id, name, kind, geom, is_depot) values
  ('d0000000-0000-0000-0000-000000000001', 'Cebu Provincial Capitol (PDRRMO)', 'depot',
     ST_SetSRID(ST_MakePoint(123.8917, 10.3158), 4326), true),
  ('d0000000-0000-0000-0000-000000000002', 'Cebu City Hall (CDRRMO)', 'warehouse',
     ST_SetSRID(ST_MakePoint(123.9018, 10.2935), 4326), false),
  ('d0000000-0000-0000-0000-000000000003', 'IEC Convention Center (staging)', 'staging',
     ST_SetSRID(ST_MakePoint(123.8930, 10.3094), 4326), false),
  ('d0000000-0000-0000-0000-000000000004', 'Cebu South Bus Terminal (staging)', 'staging',
     ST_SetSRID(ST_MakePoint(123.8770, 10.2967), 4326), false),
  ('d0000000-0000-0000-0000-000000000005', 'Mandaue City Hall (north hub)', 'warehouse',
     ST_SetSRID(ST_MakePoint(123.9223, 10.3242), 4326), false)
on conflict (id) do nothing;

-- Real response teams, based at the depot (PDRRMO). Existing Team Sugbo gets a base + type.
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
