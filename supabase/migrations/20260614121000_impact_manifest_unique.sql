-- LUWAS — Phase 4.1: one current prediction/manifest per barangay (upsert key).
set search_path = public, extensions;

-- Collapse any pre-existing duplicates before adding the constraint (keep newest).
delete from public.impact_predictions a using public.impact_predictions b
 where a.barangay_id = b.barangay_id and a.created_at < b.created_at;
delete from public.supply_manifests a using public.supply_manifests b
 where a.barangay_id = b.barangay_id and a.created_at < b.created_at;

alter table public.impact_predictions
  add constraint impact_predictions_barangay_unique unique (barangay_id);
alter table public.supply_manifests
  add constraint supply_manifests_barangay_unique unique (barangay_id);
