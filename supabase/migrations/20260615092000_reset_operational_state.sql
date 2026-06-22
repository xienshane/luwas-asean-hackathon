-- LUWAS — demo "Reset / Clear to scratch".
--
-- Wipes coordinator-/volunteer-generated operational data and everything derived
-- from it, returning the app to a clean demo state WITHOUT touching seed data or
-- accounts. Run in one transaction (a function body is atomic):
--   * delete reports + derived pipeline output + volunteer GPS
--   * restore every blocked road to its baseline (inverse of set_edge_impassable)
--   * recompute Silent-Area scores from the now-cleared contact history
--
-- Preserved: barangays, volunteers/accounts, teams, coordinator_facilities (depot),
-- the road_edges graph topology, province_impact_features, training data.
--
-- AuthZ: this mirrors the other service-only RPCs (pipeline_targets,
-- set_edge_impassable, silent_area_score) — it is REVOKED from public and granted
-- to service_role ONLY, and is invoked exclusively by /api/reset behind an SSR
-- coordinator gate (401/403). An internal is_coordinator() check is intentionally
-- omitted: it reads auth.uid(), which is null under the service-role client, so it
-- would reject the legitimate call path.
set search_path = public, extensions;

create or replace function public.reset_operational_state()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  -- Derived pipeline output first (FKs reference field_reports), then reports + GPS.
  delete from public.routes;
  delete from public.supply_manifests;
  delete from public.impact_predictions;
  delete from public.field_reports;
  delete from public.volunteer_positions;

  -- Restore every blocked road to its saved baseline and clear the flag.
  update public.road_edges
     set cost                  = original_cost,
         reverse_cost          = original_reverse_cost,
         original_cost         = null,
         original_reverse_cost = null,
         impassable            = false
   where impassable = true;

  -- Recompute Silent-Area scores so they reflect the cleared contact history.
  perform public.silent_area_score();
end;
$$;

comment on function public.reset_operational_state() is
  'Demo reset: clears reports + derived pipeline output + volunteer GPS, restores blocked roads, rescore. Keeps accounts, barangays, teams, depot, road graph. service_role only.';

revoke execute on function public.reset_operational_state() from public;
grant  execute on function public.reset_operational_state() to service_role;
