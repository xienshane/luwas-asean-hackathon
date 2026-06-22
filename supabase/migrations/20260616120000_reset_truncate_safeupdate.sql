-- LUWAS — fix reset_operational_state under the `safeupdate` extension.
--
-- PostgREST connects as the `authenticator` role, which has
--   session_preload_libraries = supautils, safeupdate
-- so Supabase's safeupdate extension is active on every request (including the
-- service-role RPC behind /api/reset). It aborts any UPDATE/DELETE without a
-- WHERE clause ("DELETE requires a WHERE clause"), which killed the five bare
-- `delete from ...;` statements here.
--
-- Fix: TRUNCATE the operational tables instead. safeupdate only guards
-- UPDATE/DELETE, not TRUNCATE; truncating all five in one statement also
-- resolves FK order (impact_predictions -> field_reports,
-- supply_manifests -> impact_predictions) automatically. The road_edges UPDATE
-- already carries a WHERE clause, so it is unaffected.
--
-- CREATE OR REPLACE preserves the existing grants (revoked from public, granted
-- to service_role only). AuthZ is unchanged: still service_role-only, invoked
-- exclusively by /api/reset behind the SSR coordinator gate.
set search_path = public, extensions;

create or replace function public.reset_operational_state()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  -- One TRUNCATE handles FK dependencies among these tables and sidesteps the
  -- safeupdate WHERE-clause guard that blocks unqualified DELETE.
  truncate table
    public.routes,
    public.supply_manifests,
    public.impact_predictions,
    public.field_reports,
    public.volunteer_positions;

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
  'Demo reset: clears reports + derived pipeline output + volunteer GPS (TRUNCATE, safeupdate-safe), restores blocked roads, rescore. Keeps accounts, barangays, teams, depot, road graph. service_role only.';
