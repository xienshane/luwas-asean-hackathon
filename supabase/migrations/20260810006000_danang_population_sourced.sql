-- S10: replace the Đà Nẵng pack's synthetic populations with sourced ones.
--
-- The first load (data-pipeline/ingest_danang.py) carried hand-made order-of-magnitude
-- estimates, on the Lapu-Lapu / Mandaue precedent. That was defensible for a boundary
-- smoke test and indefensible on stage: population is the denominator of the Sphere
-- manifest (15 L/person/day) and a component of the Silent Area score, so an invented
-- number propagates into every figure the clip shows.
--
-- The OSM ward relations already carry the real thing — `population`, tagged
-- `source:population=gis.vn` and `population:date=2025-07-01`, the date the merger took
-- effect. All 11 urban-core wards are covered, so nothing is left estimated.
--
-- The correction is material: the synthetic table understated the urban core by ~260k
-- people (918,000 -> 1,178,687), and Phường Thanh Khê by more than half (98,000 ->
-- 201,240).
--
-- Values are updated in place rather than reloaded: `barangays.id` is referenced by
-- silent_area_scores, barangay_hazard_exposure, teams and field_reports, so re-running
-- the ingest (which deletes and reinserts) would orphan all of them.

update public.barangays as b
   set population = v.population
  from (values
    ('Phường An Hải',        82635),
    ('Phường An Khê',        93625),
    ('Phường Cẩm Lệ',        78837),
    ('Phường Hải Châu',     131427),
    ('Phường Hòa Cường',    119363),
    ('Phường Hòa Khánh',    112518),
    ('Phường Hòa Xuân',      85580),
    ('Phường Liên Chiểu',    70628),
    ('Phường Ngũ Hành Sơn', 115944),
    ('Phường Sơn Trà',       86890),
    ('Phường Thanh Khê',    201240)
  ) as v(name, population)
 where b.region = 'danang'
   and b.name   = v.name;

-- Fail loudly rather than half-apply: a partial match means a ward was renamed or the
-- pack was reloaded with different names, and a silently-skipped row would leave a
-- synthetic population in place with nothing flagging it.
do $$
declare
  n_total int;
  n_sourced int;
begin
  select count(*) into n_total   from public.barangays where region = 'danang';
  select count(*) into n_sourced from public.barangays
   where region = 'danang' and population in
     (82635, 93625, 78837, 131427, 119363, 112518, 85580, 70628, 115944, 86890, 201240);

  if n_total <> 11 or n_sourced <> 11 then
    raise exception
      'danang population backfill incomplete: % of % wards sourced', n_sourced, n_total;
  end if;
end $$;
