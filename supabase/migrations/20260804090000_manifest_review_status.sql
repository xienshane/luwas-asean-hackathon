-- Coordinator review state for a supply manifest, persisted so it survives the
-- realtime refetch that follows every pipeline run. Approve/Reject was client-only
-- state before this; any refetch reset it mid-operation.
--
-- The pipeline upsert (/api/pipeline) deliberately OMITS this column, exactly as it
-- omits impact_predictions.override_value: PostgREST writes ON CONFLICT DO UPDATE for
-- the supplied columns only, so a re-run refreshes the quantities and leaves the
-- coordinator's decision intact.
set search_path = public, extensions;

alter table public.supply_manifests
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'supply_manifests_status_check'
  ) then
    alter table public.supply_manifests
      add constraint supply_manifests_status_check
      check (status in ('pending', 'approved', 'modified', 'rejected'));
  end if;
end $$;

comment on column public.supply_manifests.status is
  'Coordinator review state: pending | approved | modified | rejected. Set by the coordinator UI; never written by the pipeline upsert.';

-- Surface it on the coordinator read model. The view has a fixed column list, so the
-- column alone would still leave every refetch reading the old shape. Drop + recreate
-- to preserve security_invoker and the authenticated grant while appending.
drop view if exists public.coordinator_supply_manifests;
create view public.coordinator_supply_manifests
with (security_invoker = true) as
  select barangay_id, impact_prediction_id, days, access_modifier,
         water_l, food_packs, shelter_kits, blankets, breakdown, overridden,
         status, created_at
    from public.supply_manifests;
grant select on public.coordinator_supply_manifests to authenticated;
