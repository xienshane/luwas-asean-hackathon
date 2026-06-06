-- LUWAS — Phase 2.1: Silent Area scoring engine
--
-- Computes, per barangay, a composite priority score that surfaces "silent
-- areas" — places we have NOT heard from that are populous and hazard-exposed.
--
--   score = pop_density_norm  ×  hazard_norm  ×  time_factor          (each ∈ [0,1])
--
--   • pop_density_norm — log-min-max of (population / land km²). Cebu City
--     density spans ~143 → ~110,000 /km²; the log keeps the densest barangay
--     from flattening everyone else. Barangays with no PSA population → 0.
--   • hazard_norm — min-max of each barangay's WORST area-weighted NOAH exposure
--     (max over flood / landslide / storm-surge layers, each already ∈ [0,1]).
--   • time_factor — the "silence ramp": 1 − exp(−hours_since_contact / τ).
--     A barangay we just confirmed contact with ≈ 0; one we have NEVER heard
--     from = 1.0 (maximum silence). The DevPlan calls this term "time_decay":
--     it is the decay of our CONFIDENCE that a barangay is fine, so priority
--     RISES with silence — matching the acceptance criterion (no recent contact
--     + high population/hazard ⇒ top of the ranking).
--
-- Every component and its raw inputs are stored, so any score is reproducible
-- by hand and feeds the Phase 3.1 score-breakdown tooltip. The function is pure
-- SQL (no model, no external call) and runs on a 15-minute pg_cron schedule.
--
-- Inputs (Phase 1.1): public.barangays (population, geom),
-- public.barangay_hazard_exposure (per-hazard exposure), public.field_reports
-- (status='confirmed' ⇒ a confirmed contact at created_at).

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Results table — one row per barangay, upserted every run
-- ---------------------------------------------------------------------------
create table if not exists public.silent_area_scores (
  barangay_id            uuid primary key references public.barangays (id) on delete cascade,
  score                  double precision not null,          -- final priority ∈ [0,1]
  pop_density            double precision,                   -- people / km² (null = no PSA pop)
  pop_density_norm       double precision not null,          -- log-min-max ∈ [0,1]
  hazard_composite       double precision,                   -- worst area-weighted exposure ∈ [0,1]
  hazard_norm            double precision not null,          -- min-max ∈ [0,1]
  last_confirmed_contact timestamptz,                        -- null = never contacted
  hours_since_contact    double precision,                   -- null = never contacted (max silence)
  time_factor            double precision not null,          -- silence ramp ∈ [0,1]
  inputs                 jsonb,                              -- raw components for audit / tooltip
  computed_at            timestamptz not null default now()
);
create index if not exists silent_area_scores_score_idx
  on public.silent_area_scores (score desc);

comment on table public.silent_area_scores is
  'Phase 2.1 Silent Area priority scores; recomputed every 15 min by silent_area_score().';

-- ---------------------------------------------------------------------------
-- 2. The scoring function — pure SQL, parameterized for testability
-- ---------------------------------------------------------------------------
-- tau_hours sets the silence-ramp time constant (default 24h: ~0.63 at 24h,
-- ~0.95 at 72h). now_ts is injectable so tests can drive time deterministically.
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
  -- 4) normalization bounds (log for the skewed density; linear for hazard)
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
  -- 5) assemble per-barangay components
  scored as (
    select b.id as barangay_id,
           d.pop_density,
           h.hazard_composite,
           c.last_confirmed_contact,
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
           end as hazard_norm
      from public.barangays b
      left join density d on d.barangay_id = b.id
      left join hazard  h on h.barangay_id = b.id
      left join contact c on c.barangay_id = b.id
      cross join dbounds db
      cross join hbounds hb
     where b.geom is not null
  ),
  final as (
    select barangay_id, pop_density, hazard_composite, last_confirmed_contact,
           hours_since_contact, pop_density_norm, hazard_norm,
           case
             when hours_since_contact is null then 1.0   -- never contacted = max silence
             else 1 - exp(- hours_since_contact / tau_hours::double precision)
           end as time_factor
      from scored
  ),
  ins as (
    insert into public.silent_area_scores as s (
      barangay_id, score, pop_density, pop_density_norm, hazard_composite,
      hazard_norm, last_confirmed_contact, hours_since_contact, time_factor,
      inputs, computed_at
    )
    select f.barangay_id,
           f.pop_density_norm * f.hazard_norm * f.time_factor as score,
           f.pop_density, f.pop_density_norm, f.hazard_composite, f.hazard_norm,
           f.last_confirmed_contact, f.hours_since_contact, f.time_factor,
           jsonb_build_object(
             'pop_density',        f.pop_density,
             'pop_density_norm',   f.pop_density_norm,
             'hazard_composite',   f.hazard_composite,
             'hazard_norm',        f.hazard_norm,
             'hours_since_contact',f.hours_since_contact,
             'tau_hours',          tau_hours,
             'time_factor',        f.time_factor
           ),
           now_ts
      from final f
    on conflict (barangay_id) do update set
      score                  = excluded.score,
      pop_density            = excluded.pop_density,
      pop_density_norm       = excluded.pop_density_norm,
      hazard_composite       = excluded.hazard_composite,
      hazard_norm            = excluded.hazard_norm,
      last_confirmed_contact = excluded.last_confirmed_contact,
      hours_since_contact    = excluded.hours_since_contact,
      time_factor            = excluded.time_factor,
      inputs                 = excluded.inputs,
      computed_at            = excluded.computed_at
    returning 1
  )
  select count(*) from ins;
$$;

comment on function public.silent_area_score(numeric, timestamptz) is
  'Phase 2.1: recompute Silent Area priority scores into public.silent_area_scores; pure SQL, explainable.';

-- ---------------------------------------------------------------------------
-- 3. Privileges + RLS
-- ---------------------------------------------------------------------------
-- Scores drive the coordinator map; the cron / service_role write (RLS-bypass).
grant select on public.silent_area_scores to authenticated;
grant all    on public.silent_area_scores to service_role;

alter table public.silent_area_scores enable row level security;
drop policy if exists silent_area_scores_read_coordinator on public.silent_area_scores;
create policy silent_area_scores_read_coordinator on public.silent_area_scores
  for select to authenticated
  using ((select public.is_coordinator()));

-- The function is invoked by cron (postgres) and may be triggered by the app
-- (service_role); it is not a public RPC endpoint.
revoke execute on function public.silent_area_score(numeric, timestamptz) from public;
grant  execute on function public.silent_area_score(numeric, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Schedule the 15-minute recompute (idempotent)
-- ---------------------------------------------------------------------------
select cron.unschedule('silent-area-score-15min')
 where exists (select 1 from cron.job where jobname = 'silent-area-score-15min');

select cron.schedule(
  'silent-area-score-15min',
  '*/15 * * * *',
  $cron$select public.silent_area_score();$cron$
);

-- Seed an initial scoring pass so the table is populated immediately.
select public.silent_area_score();
