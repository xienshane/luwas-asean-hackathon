-- Composite barangay prioritization acceptance tests for Phase 4.4 (pgTAP).
--
-- Run with the Supabase CLI:  supabase test db
-- (or execute against a database that has the pgtap extension enabled).
--
-- Acceptance criteria proven here (DevPlan 4.4):
--   * Priority reflects vulnerability and predicted impact, NOT silence alone:
--     a recently-contacted (silence ≈ 0) but high-impact, high-vulnerability
--     barangay still ranks meaningfully — strictly above a silent twin that has
--     none of those signals.
--   * A single zero term no longer zeros priority (the multiplicative form would
--     have): the recently-contacted high-impact barangay has time_factor ≈ 0 yet
--     a clearly positive score.
--   * The score is reproducible by hand from the stored `inputs`: it equals the
--     sum of (weight × component) over the six components, and stays in [0,1].
--
-- The whole file runs inside one transaction and rolls back, so it never leaves
-- fixtures behind and never disturbs the production scores table.

begin;
set search_path = public, extensions, pg_temp;

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures: three TWIN barangays with identical, extreme population density and
-- identical maximum hazard exposure (so pop_density_norm = hazard_norm = 1.0 for
-- all three — they are the global density/hazard maxima). We then vary ONLY the
-- live signals to isolate the composite blend:
--   A — never contacted, NO impact prediction, no nearby report
--         → time_factor = 1.0 ; impact_frac = 0 ; nearby_norm = 0
--   B — confirmed-contacted 1h ago, HIGH impact prediction
--         → time_factor ≈ 0   ; impact_frac = 1.0 ; nearby_norm = 0
--   C — confirmed-contacted 1h ago, NO impact prediction
--         → time_factor ≈ 0   ; impact_frac = 0   ; nearby_norm = 0
-- structural_vuln_frac is identical for all three (same province). B isolates
-- "impact + recent contact still ranks"; C is the no-signal recently-contacted
-- baseline B must beat.
-- ---------------------------------------------------------------------------
insert into public.barangays
  (psgc_code, name, city_municipality, province, population, geom, centroid)
values
  ('TEST-CP-A', 'Composite Twin A', 'Testopolis', 'Cebu', 50000,
     st_multi(st_setsrid(st_makeenvelope(123.9000, 10.3000, 123.9001, 10.3001), 4326)),
     st_setsrid(st_makepoint(123.90005, 10.30005), 4326)),
  ('TEST-CP-B', 'Composite Twin B', 'Testopolis', 'Cebu', 50000,
     st_multi(st_setsrid(st_makeenvelope(123.9000, 10.3000, 123.9001, 10.3001), 4326)),
     st_setsrid(st_makepoint(123.90005, 10.30005), 4326)),
  ('TEST-CP-C', 'Composite Twin C', 'Testopolis', 'Cebu', 50000,
     st_multi(st_setsrid(st_makeenvelope(123.9000, 10.3000, 123.9001, 10.3001), 4326)),
     st_setsrid(st_makepoint(123.90005, 10.30005), 4326));

insert into public.barangay_hazard_exposure
  (barangay_id, psgc_code, hazard_type, exposure, exposed_fraction, max_class_norm)
select id, psgc_code, 'flood_100yr', 1.0, 1.0, 1.0
  from public.barangays
 where psgc_code in ('TEST-CP-A', 'TEST-CP-B', 'TEST-CP-C');

-- B and C were both confirmed-contacted exactly 1 hour before the eval time.
insert into public.field_reports (barangay_id, source, status, created_at)
select id, 'app', 'confirmed', timestamptz '2026-06-05 12:00:00+00' - interval '1 hour'
  from public.barangays
 where psgc_code in ('TEST-CP-B', 'TEST-CP-C');

-- B alone has a HIGH impact prediction (affected ≥ population ⇒ impact_frac clamps to 1.0).
insert into public.impact_predictions
  (barangay_id, model, predicted_affected, damage_severity, confidence, is_day0)
select id, 'tabpfn', 60000, 'severe', 0.9, true
  from public.barangays
 where psgc_code = 'TEST-CP-B';

-- Recompute at a FIXED evaluation time with tau = 24h (deterministic).
select public.silent_area_score(24, timestamptz '2026-06-05 12:00:00+00');

-- ---------------------------------------------------------------------------
-- 1. Priority is NOT silence alone: the recently-contacted high-impact twin B
--    ranks strictly ABOVE the recently-contacted no-signal twin C.
-- ---------------------------------------------------------------------------
select ok(
  (select score from public.silent_area_scores s
     join public.barangays b on b.id = s.barangay_id where b.psgc_code = 'TEST-CP-B')
  >
  (select score from public.silent_area_scores s
     join public.barangays b on b.id = s.barangay_id where b.psgc_code = 'TEST-CP-C'),
  'predicted impact lifts priority even with recent contact (not silence alone)'
);

-- ---------------------------------------------------------------------------
-- 2. A single zero term does NOT zero priority: twin B has time_factor ≈ 0
--    (contacted 1h ago) yet a clearly positive composite score.
-- ---------------------------------------------------------------------------
select ok(
  (select score from public.silent_area_scores s
     join public.barangays b on b.id = s.barangay_id where b.psgc_code = 'TEST-CP-B') > 0.5,
  'recently-contacted high-impact barangay still scores high (no single zero term zeros it)'
);

-- ---------------------------------------------------------------------------
-- 3. The composite is reproducible by hand from the stored inputs/weights:
--    score = Σ weightᵢ × componentᵢ over the six components, for EVERY barangay.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)
     from public.silent_area_scores s
    where abs(
            s.score - (
                (s.inputs->'weights'->>'pop')::double precision     * s.pop_density_norm
              + (s.inputs->'weights'->>'hazard')::double precision  * s.hazard_norm
              + (s.inputs->'weights'->>'vuln')::double precision    * s.structural_vuln_frac
              + (s.inputs->'weights'->>'impact')::double precision  * s.impact_frac
              + (s.inputs->'weights'->>'silence')::double precision * s.time_factor
              + (s.inputs->'weights'->>'nearby')::double precision  * s.nearby_norm
            )
          ) > 1e-9),
  0::bigint,
  'every score equals the weighted sum of its six stored components (reproducible by hand)'
);

-- ---------------------------------------------------------------------------
-- 4. The blend weights sum to 1.0 (so the score is a proper convex combination).
-- ---------------------------------------------------------------------------
select ok(
  (select abs(
            (inputs->'weights'->>'pop')::double precision
          + (inputs->'weights'->>'hazard')::double precision
          + (inputs->'weights'->>'vuln')::double precision
          + (inputs->'weights'->>'impact')::double precision
          + (inputs->'weights'->>'silence')::double precision
          + (inputs->'weights'->>'nearby')::double precision
          - 1.0) < 1e-9
     from public.silent_area_scores limit 1),
  'composite weights sum to 1.0'
);

-- ---------------------------------------------------------------------------
-- 5. Global invariant: every composite score stays within [0,1].
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.silent_area_scores
    where score < -1e-9 or score > 1 + 1e-9),
  0::bigint,
  'every composite score is in [0,1]'
);

-- ---------------------------------------------------------------------------
-- 6. The high impact prediction was bounded into impact_frac = 1.0 for twin B
--    (affected 60000 ≥ population 50000), and stored explainably.
-- ---------------------------------------------------------------------------
select ok(
  abs(
    (select impact_frac from public.silent_area_scores s
       join public.barangays b on b.id = s.barangay_id where b.psgc_code = 'TEST-CP-B')
    - 1.0
  ) < 1e-9,
  'over-population affected clamps to impact_frac = 1.0 (bounded, explainable)'
);

select * from finish();
rollback;
