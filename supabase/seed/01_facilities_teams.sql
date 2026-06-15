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
