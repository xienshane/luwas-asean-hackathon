-- LUWAS — Phase 4.4: composite barangay prioritization (Issues 6 & 1).
--
-- Phase 2.1 scored a barangay PURELY on silence:
--     score = pop_density_norm × hazard_norm × time_factor          (multiplicative)
-- That made silence necessary — a single zero term (e.g. a barangay we just
-- confirmed contact with → time_factor ≈ 0) zeroed the whole priority, hiding a
-- populous, hazard-exposed, high-impact place the moment one report arrived.
--
-- This migration makes silence ONE SIGNAL AMONG SEVERAL. The pure product is
-- replaced by a documented WEIGHTED BLEND of six components, each already ∈ [0,1]:
--
--     priority =  w_pop     · pop_density_norm        (population at risk)
--               + w_hazard  · hazard_norm             (NOAH flood/landslide/surge)
--               + w_vuln    · structural_vuln_frac    (HDX housing fragility, province prior)
--               + w_impact  · impact_frac             (latest TabPFN affected ÷ population)
--               + w_silence · time_factor             (the Phase 2.1 silence ramp)
--               + w_nearby  · nearby_norm             (proximity to confirmed activity)
--
--   weights:  w_pop=0.15  w_hazard=0.20  w_vuln=0.15  w_impact=0.25
--             w_silence=0.15  w_nearby=0.10            (Σ = 1.0)
--
-- Because the blend is ADDITIVE and the weights sum to 1, priority stays in [0,1]
-- and NO single zero term can zero it: a high-vulnerability, high-impact barangay
-- with recent contact (time_factor ≈ 0) still ranks meaningfully on the other
-- 0.85 of weight. Impact carries the most weight — it is the per-barangay signal
-- that REFINES the coarse province-level priors (vulnerability, and the TabPFN
-- model itself, which is trained at province granularity). That is the reviewer's
-- "hierarchical refinement" (Issue 1): a coarse prior sharpened by live, local
-- signals (impact prediction + nearby confirmed reports).
--
-- Every component, every weight, and every raw input is stored in `inputs` so the
-- final score is reproducible by hand and the Phase 3.1 breakdown tooltip still
-- reconciles. Pure SQL, no external call; runs on the same 15-min pg_cron job.
--
-- Component definitions:
--   • structural_vuln_frac — public.province_impact_features (HDX): 1 − strong-roof
--     & strong-wall share of the barangay's PROVINCE housing. Already ∈ [0,1]; used
--     raw (not min-max) because the Cebu pilot is one province, so a min-max would
--     degenerate to a constant. It is a coarse province PRIOR by design.
--   • impact_frac — the LATEST impact_predictions row for the barangay, using the
--     coordinator override when present (override flows downstream — CLAUDE.md rule),
--     expressed as affected ÷ population and clamped to [0,1]. No prediction → 0.
--   • nearby_norm — distance decay (1 − km/radius, radius = 10 km) to the nearest
--     CONFIRMED field report in OTHER barangays within the last 72 h. This is
--     orthogonal to the silence term (which is about THIS barangay): confirmed
--     disaster activity AROUND a silent barangay raises its priority. No nearby
--     confirmed report → 0.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Extend the results table with the new composite components (idempotent).
--    The Phase 2.1 columns (pop_density_norm, hazard_norm, time_factor, …) stay
--    so the coordinator map read model is unchanged for those fields.
-- ---------------------------------------------------------------------------
alter table public.silent_area_scores
  add column if not exists structural_vuln_frac double precision,   -- province HDX prior ∈ [0,1]
  add column if not exists impact_affected      integer,            -- latest TabPFN affected used
  add column if not exists impact_frac          double precision,   -- affected ÷ population ∈ [0,1]
  add column if not exists nearby_report_km     double precision,   -- km to nearest confirmed report (null = none)
  add column if not exists nearby_norm          double precision;   -- distance-decay signal ∈ [0,1]

-- ---------------------------------------------------------------------------
-- 2. Redefine the scoring function: same signature (so cron + tests are
--    untouched) but a weighted composite blend instead of the pure product.
-- ---------------------------------------------------------------------------
create or replace function public.silent_area_score(
  tau_hours numeric     default 24,
  now_ts    timestamptz default now()
)
returns bigint                          -- number of barangays scored
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  with
  -- documented blend weights (Σ = 1.0). One zero component can no longer zero priority.
  weights as (
    select 0.15::double precision as w_pop,
           0.20::double precision as w_hazard,
           0.15::double precision as w_vuln,
           0.25::double precision as w_impact,
           0.15::double precision as w_silence,
           0.10::double precision as w_nearby,
           10.0::double precision as nearby_radius_km   -- distance-decay radius for nearby_norm
  ),
  -- 1) population density (people / km²) for barangays with geometry
  density as (
    select b.id as barangay_id,
           b.population::double precision
             / nullif(st_area(b.geom::geography) / 1e6, 0) as pop_density
      from public.barangays b
     where b.geom is not null
  ),
  -- 2) worst-hazard composite per barangay (area-weighted exposure ∈ [0,1])
  hazard as (
    select he.barangay_id,
           max(he.exposure) as hazard_composite
      from public.barangay_hazard_exposure he
     group by he.barangay_id
  ),
  -- 3) last CONFIRMED field-report contact per barangay (null = never contacted)
  contact as (
    select fr.barangay_id,
           max(fr.created_at) as last_confirmed_contact
      from public.field_reports fr
     where fr.status = 'confirmed'
       and fr.barangay_id is not null
     group by fr.barangay_id
  ),
  -- 4) latest TabPFN impact prediction per barangay (coordinator override wins).
  --    This is the per-barangay signal that refines the coarse province priors.
  impact as (
    select distinct on (ip.barangay_id)
           ip.barangay_id,
           coalesce(ip.override_value, ip.predicted_affected) as impact_affected
      from public.impact_predictions ip
     order by ip.barangay_id, ip.created_at desc
  ),
  -- 5) nearest CONFIRMED report in OTHER barangays in the last 72h (km).
  --    Orthogonal to silence: confirmed activity AROUND a barangay raises it.
  nearby as (
    select b.id as barangay_id,
           min(st_distance(b.centroid::geography, fr.location::geography)) / 1000.0 as nearby_km
      from public.barangays b
      join public.field_reports fr
        on fr.status = 'confirmed'
       and fr.location is not null
       and fr.barangay_id is distinct from b.id
       and fr.created_at > now_ts - interval '72 hours'
     where b.centroid is not null
     group by b.id
  ),
  -- 6) normalization bounds (log for the skewed density; linear for hazard)
  dbounds as (
    select min(ln(pop_density)) as ln_min,
           max(ln(pop_density)) as ln_max
      from density
     where pop_density > 0
  ),
  hbounds as (
    select min(hazard_composite) as h_min,
           max(hazard_composite) as h_max
      from hazard
  ),
  -- 7) assemble per-barangay components (each ∈ [0,1])
  scored as (
    select b.id as barangay_id,
           b.population,
           d.pop_density,
           h.hazard_composite,
           c.last_confirmed_contact,
           im.impact_affected,
           nb.nearby_km,
           coalesce(pf.structural_vuln_frac, 0.0) as structural_vuln_frac,
           case
             when c.last_confirmed_contact is null then null
             else greatest(extract(epoch from (now_ts - c.last_confirmed_contact)) / 3600.0, 0)
           end as hours_since_contact,
           case
             when d.pop_density is null or d.pop_density <= 0 then 0.0
             when db.ln_max = db.ln_min then 1.0       -- degenerate single-value set
             else (ln(d.pop_density) - db.ln_min) / (db.ln_max - db.ln_min)
           end as pop_density_norm,
           case
             when h.hazard_composite is null then 0.0
             when hb.h_max = hb.h_min then 1.0
             else (h.hazard_composite - hb.h_min) / (hb.h_max - hb.h_min)
           end as hazard_norm,
           case
             when im.impact_affected is null or b.population is null or b.population <= 0 then 0.0
             else least(greatest(im.impact_affected, 0)::double precision / b.population, 1.0)
           end as impact_frac,
           case
             when nb.nearby_km is null then 0.0
             else greatest(1.0 - nb.nearby_km / w.nearby_radius_km, 0.0)
           end as nearby_norm
      from public.barangays b
      left join density d on d.barangay_id = b.id
      left join hazard  h on h.barangay_id = b.id
      left join contact c on c.barangay_id = b.id
      left join impact  im on im.barangay_id = b.id
      left join nearby  nb on nb.barangay_id = b.id
      left join public.province_impact_features pf on pf.province = b.province
      cross join dbounds db
      cross join hbounds hb
      cross join weights w
     where b.geom is not null
  ),
  final as (
    select s.*,
           case
             when s.hours_since_contact is null then 1.0   -- never contacted = max silence
             else 1 - exp(- s.hours_since_contact / tau_hours::double precision)
           end as time_factor
      from scored s
  ),
  ins as (
    insert into public.silent_area_scores as t (
      barangay_id, score, pop_density, pop_density_norm, hazard_composite,
      hazard_norm, last_confirmed_contact, hours_since_contact, time_factor,
      structural_vuln_frac, impact_affected, impact_frac, nearby_report_km, nearby_norm,
      inputs, computed_at
    )
    select f.barangay_id,
           -- the weighted composite blend (Σ weights = 1 ⇒ score ∈ [0,1])
           w.w_pop     * f.pop_density_norm
         + w.w_hazard  * f.hazard_norm
         + w.w_vuln    * f.structural_vuln_frac
         + w.w_impact  * f.impact_frac
         + w.w_silence * f.time_factor
         + w.w_nearby  * f.nearby_norm                                  as score,
           f.pop_density, f.pop_density_norm, f.hazard_composite, f.hazard_norm,
           f.last_confirmed_contact, f.hours_since_contact, f.time_factor,
           f.structural_vuln_frac, f.impact_affected, f.impact_frac, f.nearby_km, f.nearby_norm,
           jsonb_build_object(
             'pop_density',          f.pop_density,
             'pop_density_norm',     f.pop_density_norm,
             'hazard_composite',     f.hazard_composite,
             'hazard_norm',          f.hazard_norm,
             'hours_since_contact',  f.hours_since_contact,
             'tau_hours',            tau_hours,
             'time_factor',          f.time_factor,
             'structural_vuln_frac', f.structural_vuln_frac,
             'impact_affected',      f.impact_affected,
             'impact_frac',          f.impact_frac,
             'nearby_report_km',     f.nearby_km,
             'nearby_radius_km',     w.nearby_radius_km,
             'nearby_norm',          f.nearby_norm,
             'weights', jsonb_build_object(
               'pop',     w.w_pop,     'hazard',  w.w_hazard, 'vuln',   w.w_vuln,
               'impact',  w.w_impact,  'silence', w.w_silence,'nearby', w.w_nearby
             )
           ),
           now_ts
      from final f
      cross join weights w
    on conflict (barangay_id) do update set
      score                  = excluded.score,
      pop_density            = excluded.pop_density,
      pop_density_norm       = excluded.pop_density_norm,
      hazard_composite       = excluded.hazard_composite,
      hazard_norm            = excluded.hazard_norm,
      last_confirmed_contact = excluded.last_confirmed_contact,
      hours_since_contact    = excluded.hours_since_contact,
      time_factor            = excluded.time_factor,
      structural_vuln_frac   = excluded.structural_vuln_frac,
      impact_affected        = excluded.impact_affected,
      impact_frac            = excluded.impact_frac,
      nearby_report_km       = excluded.nearby_report_km,
      nearby_norm            = excluded.nearby_norm,
      inputs                 = excluded.inputs,
      computed_at            = excluded.computed_at
    returning 1
  )
  select count(*) from ins;
$$;

comment on function public.silent_area_score(numeric, timestamptz) is
  'Phase 4.4: weighted COMPOSITE priority (population, hazard, structural vulnerability, '
  'TabPFN impact, silence, nearby confirmed reports). Additive blend, weights Σ=1; pure SQL, '
  'explainable; every component + weight stored in inputs. Recomputed every 15 min by pg_cron.';

-- ---------------------------------------------------------------------------
-- 3. Expose the new components on the coordinator map read model so the
--    breakdown tooltip can show — and reconcile — the weighted blend.
--    (Re-create the Phase 3.1 view with the extra columns; security_invoker
--    preserves the coordinator-only RLS on silent_area_scores.)
-- ---------------------------------------------------------------------------
create or replace view public.coordinator_barangay_scores
with (security_invoker = true) as
select
  b.id,
  b.name,
  b.city_municipality,
  b.province,
  b.population,
  st_y(b.centroid)                                                 as latitude,
  st_x(b.centroid)                                                 as longitude,
  st_asgeojson(st_simplifypreservetopology(b.geom, 0.0003))::jsonb as boundary,
  s.score,
  s.pop_density,
  s.pop_density_norm,
  s.hazard_composite,
  s.hazard_norm,
  s.hours_since_contact,
  s.last_confirmed_contact,
  s.time_factor,
  s.computed_at,
  -- Phase 4.4 composite components appended AFTER computed_at: create-or-replace view
  -- can only ADD trailing columns, not reorder the Phase 3.1 ones. Order is irrelevant
  -- to the client (it selects by name).
  s.structural_vuln_frac,
  s.impact_affected,
  s.impact_frac,
  s.nearby_report_km,
  s.nearby_norm,
  s.inputs
from public.barangays b
join public.silent_area_scores s on s.barangay_id = b.id;

comment on view public.coordinator_barangay_scores is
  'Phase 3.1 read model, extended in Phase 4.4: barangay identity + simplified boundary '
  'GeoJSON joined to the live composite priority + all its weighted components (inputs jsonb) '
  'for the coordinator map breakdown tooltip. security_invoker so scores RLS applies.';

grant select on public.coordinator_barangay_scores to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Recompute immediately so the new components populate on deploy.
-- ---------------------------------------------------------------------------
select public.silent_area_score();
