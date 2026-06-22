-- LUWAS — Phase 4.3: uncertainty-aware impact output.
--
-- TabPFN already computes an 80% predictive interval for `affected` (the 0.1/0.9
-- quantiles); until now the pipeline kept only the point estimate and a scalar
-- confidence. This migration persists the interval so the coordinator console can render
-- affected as a RANGE ("1,200 (820–1,740)") and visibly flag wide-interval predictions as
-- decision support, not fact. Bounds are stored at the same barangay-bounded scale as
-- `predicted_affected` (derived from the damage_rate quantiles × population in the
-- pipeline). NULL on the heuristic path (no interval) — the `model` flag marks those.
-- Additive: existing rows keep NULL bounds and the report-driven pipeline is untouched.
set search_path = public, extensions;

-- 1 ─ Interval columns alongside the existing point estimate.
alter table public.impact_predictions
  add column if not exists affected_low  integer,
  add column if not exists affected_high integer;

-- 2 ─ Surface the bounds to the coordinator read model (keep prior columns + is_day0).
--     Dropped + recreated rather than `create or replace`: appending columns to an
--     existing view is fine, but a plain replace cannot change the column list shape.
drop view if exists public.coordinator_impact_predictions;
create view public.coordinator_impact_predictions
with (security_invoker = true) as
  select barangay_id, model, predicted_affected, damage_severity,
         confidence, override_value, inputs, created_at, is_day0,
         affected_low, affected_high
    from public.impact_predictions;
grant select on public.coordinator_impact_predictions to authenticated;
