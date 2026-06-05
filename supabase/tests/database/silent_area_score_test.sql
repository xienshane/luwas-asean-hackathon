-- Silent Area scoring acceptance tests for Phase 2.1 (pgTAP).
--
-- Run with the Supabase CLI:  supabase test db
-- (or execute against a database that has the pgtap extension enabled).
--
-- Acceptance criteria proven here:
--   * A silent (never-contacted), high-population, high-hazard barangay ranks
--     at the TOP of the Silent Area scores.
--   * The time-decay term works: an otherwise-IDENTICAL twin that was confirmed
--     contacted recently scores strictly LOWER than the silent twin.
--   * The contacted twin's score equals the silence ramp 1 − exp(−Δt/τ) computed
--     by hand — i.e. the score is explainable / reproducible from its inputs.
--   * Every score is in [0,1] and equals pop_density_norm × hazard_norm ×
--     time_factor (the stored components reconstruct the score exactly).
--
-- The whole file runs inside one transaction and rolls back, so it never leaves
-- fixtures behind and never disturbs the production scores table.

begin;
set search_path = public, extensions, pg_temp;

select plan(5);

-- ---------------------------------------------------------------------------
-- Fixtures: two TWIN barangays with identical, extreme population density and
-- identical maximum hazard exposure. The ONLY difference between them is contact
-- history, which isolates the time-decay term:
--   A — never contacted          -> time_factor = 1.0  (maximum silence)
--   B — confirmed-contacted 1h ago at the fixed evaluation time
-- Their density (50k people in a ~120 m² box) is far above any real barangay,
-- so both become the global density maximum (pop_density_norm = 1.0) and, with
-- exposure = 1.0, the global hazard maximum (hazard_norm = 1.0). A therefore
-- scores the theoretical max of 1.0 and ranks #1 overall.
-- ---------------------------------------------------------------------------
insert into public.barangays
  (psgc_code, name, city_municipality, province, population, geom, centroid)
values
  ('TEST-SAS-A', 'Silent Twin A', 'Testopolis', 'Cebu', 50000,
     st_multi(st_setsrid(st_makeenvelope(123.9000, 10.3000, 123.9001, 10.3001), 4326)),
     st_setsrid(st_makepoint(123.90005, 10.30005), 4326)),
  ('TEST-SAS-B', 'Contacted Twin B', 'Testopolis', 'Cebu', 50000,
     st_multi(st_setsrid(st_makeenvelope(123.9000, 10.3000, 123.9001, 10.3001), 4326)),
     st_setsrid(st_makepoint(123.90005, 10.30005), 4326));

insert into public.barangay_hazard_exposure
  (barangay_id, psgc_code, hazard_type, exposure, exposed_fraction, max_class_norm)
select id, psgc_code, 'flood_100yr', 1.0, 1.0, 1.0
  from public.barangays
 where psgc_code in ('TEST-SAS-A', 'TEST-SAS-B');

-- B was confirmed-contacted exactly 1 hour before our fixed evaluation time.
insert into public.field_reports (barangay_id, source, status, created_at)
select id, 'app', 'confirmed', timestamptz '2026-06-05 12:00:00+00' - interval '1 hour'
  from public.barangays
 where psgc_code = 'TEST-SAS-B';

-- Recompute at a FIXED evaluation time with tau = 24h (deterministic).
select public.silent_area_score(24, timestamptz '2026-06-05 12:00:00+00');

-- ---------------------------------------------------------------------------
-- 1. The silent, high-density, high-hazard barangay ranks #1 overall.
-- ---------------------------------------------------------------------------
select is(
  (select b.psgc_code
     from public.silent_area_scores s
     join public.barangays b on b.id = s.barangay_id
    order by s.score desc, b.psgc_code
    limit 1),
  'TEST-SAS-A',
  'silent high-density high-hazard barangay ranks #1 overall'
);

-- ---------------------------------------------------------------------------
-- 2. That silent twin earns the theoretical maximum score of 1.0.
-- ---------------------------------------------------------------------------
select ok(
  (select score
     from public.silent_area_scores s
     join public.barangays b on b.id = s.barangay_id
    where b.psgc_code = 'TEST-SAS-A') = 1.0::float8,
  'silent twin score is the theoretical max (1.0 × 1.0 × 1.0)'
);

-- ---------------------------------------------------------------------------
-- 3. Time-decay term: the recently-contacted twin ranks strictly below the
--    silent twin even though population and hazard are identical.
-- ---------------------------------------------------------------------------
select ok(
  (select score from public.silent_area_scores s
     join public.barangays b on b.id = s.barangay_id where b.psgc_code = 'TEST-SAS-A')
  >
  (select score from public.silent_area_scores s
     join public.barangays b on b.id = s.barangay_id where b.psgc_code = 'TEST-SAS-B'),
  'recently-contacted twin ranks below the silent twin (time-decay works)'
);

-- ---------------------------------------------------------------------------
-- 4. The contacted twin's score equals the hand-computed silence ramp
--    1 − exp(−Δt/τ) with Δt = 1h, τ = 24h  (explainable / reproducible).
-- ---------------------------------------------------------------------------
select ok(
  abs(
    (select score from public.silent_area_scores s
       join public.barangays b on b.id = s.barangay_id where b.psgc_code = 'TEST-SAS-B')
    - (1 - exp(-1.0 / 24.0))
  ) < 1e-9,
  'contacted twin score = 1 − exp(−Δt/τ) computed by hand'
);

-- ---------------------------------------------------------------------------
-- 5. Global invariant: every score is in [0,1] and reconstructs exactly from
--    its stored components (pure, explainable scoring).
-- ---------------------------------------------------------------------------
select is(
  (select count(*)
     from public.silent_area_scores
    where score < -1e-9
       or score > 1 + 1e-9
       or abs(score - pop_density_norm * hazard_norm * time_factor) > 1e-9),
  0::bigint,
  'every score is in [0,1] and equals pop_density_norm × hazard_norm × time_factor'
);

select * from finish();
rollback;
