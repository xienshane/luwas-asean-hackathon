-- Reported affected from the latest CONFIRMED field report, when present.
-- Drives the Sphere manifest basis with precedence:
--   override_value > reported_affected > predicted_affected.
-- Injected by the Next.js pipeline orchestrator (/api/pipeline), not the TabPFN model.
set search_path = public, extensions;

alter table public.impact_predictions
  add column if not exists reported_affected integer;

comment on column public.impact_predictions.reported_affected is
  'Affected count from the latest confirmed field_report for this barangay (null if none). Precedence: override_value > reported_affected > predicted_affected.';

-- Surface the new column to the coordinator read model. Drop + recreate to preserve
-- security_invoker and the authenticated grant while appending the column.
drop view if exists public.coordinator_impact_predictions;
create view public.coordinator_impact_predictions
with (security_invoker = true) as
  select barangay_id, model, predicted_affected, damage_severity,
         confidence, override_value, inputs, created_at, is_day0,
         affected_low, affected_high, reported_affected
    from public.impact_predictions;
grant select on public.coordinator_impact_predictions to authenticated;
