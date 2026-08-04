import type { createAdminClient } from '@/lib/supabase/admin';
import { optimizeRoutes } from '@/lib/ai/routing';
import type { RouteStop, Vehicle } from '@/lib/types/routing';

type AdminClient = ReturnType<typeof createAdminClient>;

const SERVICE_SECONDS = 600; // unload time per stop

/** The subset of a pipeline target the routing stage needs. */
export interface RouteTarget {
  barangay_id: string;
  name: string;
  lat: number;
  lng: number;
  score: number;
}

export interface PlanRoutesResult {
  routes: number;
  dropped?: string[];
  solverStatus?: string;
  /** Something the coordinator must see but that did not invalidate the run. */
  note?: string;
  /** Set only when nothing persisted; the caller returns 500 with this. */
  error?: string;
}

/**
 * Real-road cost matrix -> OR-Tools -> replace the planned routes.
 *
 * Shared by the full pipeline and the reroute fast path: the two differ only in where
 * `demandByBrgy` comes from (freshly built manifests vs. stored ones), never in how the
 * plan is solved or saved.
 */
export async function planAndSaveRoutes(
  admin: AdminClient,
  targets: RouteTarget[],
  demandByBrgy: Map<string, number>,
): Promise<PlanRoutesResult> {
  const { data: depot } = await admin
    .from('coordinator_facilities').select('latitude,longitude').eq('is_depot', true).maybeSingle();
  const { data: teamRows } = await admin
    .from('coordinator_teams').select('id,capacity_kg').not('capacity_kg', 'is', null);
  if (!depot || !teamRows || teamRows.length === 0) {
    return { routes: 0, note: 'no depot or teams' };
  }

  const points = [
    { lat: depot.latitude, lng: depot.longitude },
    ...targets.map((t) => ({ lat: t.lat, lng: t.lng })),
  ];
  const { data: cm, error: cmErr } = await admin.rpc('pipeline_cost_matrix', { p_points: points, p_speed_kmh: 30 });
  if (cmErr) return { routes: 0, error: `cost_matrix: ${cmErr.message}` };
  const vids: number[] = cm.vids;
  const matrix: number[][] = cm.seconds;

  // Depot is stop 0; demand from manifests; priority from the Silent-Area score.
  const stops: RouteStop[] = [
    { id: '__depot__', name: 'Depot' },
    ...targets.map((t) => ({
      id: t.barangay_id, name: t.name,
      demand_kg: demandByBrgy.get(t.barangay_id) ?? 0,
      priority: Math.round((t.score ?? 0) * 1000),
      service_seconds: SERVICE_SECONDS,
    })),
  ];
  const vehicles: Vehicle[] = teamRows.map((t) => ({ id: t.id as string, capacity_kg: Number(t.capacity_kg) }));
  const solved = await optimizeRoutes({ stops, cost_matrix: matrix, vehicles, depot_index: 0, allow_dropping_stops: true });

  {
    // A failed delete leaves the previous plan in place and stacks the new one on top —
    // duplicate routes on the map, from a query that returned no error to anyone.
    const { error } = await admin.from('routes').delete().eq('status', 'planned');
    if (error) return { routes: 0, error: `clear planned routes: ${error.message}` };
  }

  let routes = 0;
  let attempted = 0;
  const saveErrors: string[] = [];
  for (const vr of solved.routes) {
    if (vr.stops.length === 0) continue;
    attempted += 1;
    // ordered vids: depot -> each served stop -> depot (vids aligned to `points`/`stops`)
    const orderedVids = [vids[0]];
    for (const sv of vr.stops) {
      const idx = stops.findIndex((s) => s.id === sv.stop_id);
      if (idx > 0) orderedVids.push(vids[idx]);
    }
    orderedVids.push(vids[0]);
    const stopsJson = vr.stops.map((sv) => ({
      sequence: sv.seq, barangayId: sv.stop_id,
      barangayName: stops.find((s) => s.id === sv.stop_id)?.name ?? '',
      action: 'Relief delivery', arrivalSeconds: sv.arrival_seconds, demandKg: sv.demand_kg,
    }));
    const { error } = await admin.rpc('pipeline_save_route', {
      p_team_id: vr.vehicle_id, p_stops: stopsJson, p_vids: orderedVids,
    });
    if (error) {
      // Swallowing this reads as a thinner plan rather than a broken one — the coordinator
      // dispatches against routes that were never written.
      console.error('pipeline_save_route failed', error);
      saveErrors.push(error.message);
    } else {
      routes += 1;
    }
  }

  const result: PlanRoutesResult = {
    routes,
    dropped: solved.dropped_stop_ids,
    solverStatus: solved.solver_status,
  };
  if (saveErrors.length > 0) {
    result.note = `${saveErrors.length} of ${attempted} route saves failed — ${saveErrors[0]}`;
    // Nothing persisted at all is a failed run, not a thin one.
    if (routes === 0) result.error = `route save: ${saveErrors[0]}`;
  }
  return result;
}
