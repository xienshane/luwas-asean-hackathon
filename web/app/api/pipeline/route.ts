import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { predictImpact } from '@/lib/ai/impact';
import { buildManifest } from '@/lib/ai/supply';
import { optimizeRoutes } from '@/lib/ai/routing';
import { toFeatures, severityFromDamageRate, boundedAffected, boundedAffectedRange, type TargetRow } from '@/lib/pipeline/features';
import { pickAffected } from '@/lib/pipeline/affected';
import { parsePipelineMode } from '@/lib/pipeline/mode';
import type { RouteStop, Vehicle } from '@/lib/types/routing';

const DAYS = 3;
const MAX_TARGETS = 10;
const SERVICE_SECONDS = 600; // unload time per stop

// Orchestrates the full LUWAS pipeline for the barangays with active needs:
// rescore -> TabPFN impact -> Sphere manifest -> OR-Tools route -> persist.
// Coordinator-gated; all writes use the service-role client. Re-runnable: predictions
// and manifests upsert by barangay_id (override_value and the manifest review status are
// preserved); planned routes are regenerated wholesale (active/completed are untouched).
export async function POST(request: Request) {
  // 1) AuthZ: only a signed-in coordinator may trigger the (compute-heavy) pipeline.
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const barangayId: string | null = body?.barangayId ?? null;
  const categoryOrdinal: number = Number.isFinite(body?.categoryOrdinal) ? body.categoryOrdinal : 4;
  // Accepted contract; the reroute fast path itself is not implemented yet, so both
  // modes still run the full stack. Every response echoes the mode it ran.
  const mode = parsePipelineMode(body);

  const admin = createAdminClient();

  // 2) Rescore Silent Areas (idempotent; reflects the just-confirmed contact).
  {
    const { error } = await admin.rpc('silent_area_score');
    if (error) return Response.json({ error: `rescore: ${error.message}` }, { status: 500 });
  }

  // 3) Target set: active-need barangays (+ the triggering one), top by score.
  const { data: targetRows, error: tErr } = await admin.rpc('pipeline_targets', {
    p_barangay_id: barangayId, p_limit: MAX_TARGETS,
  });
  if (tErr) return Response.json({ error: `targets: ${tErr.message}` }, { status: 500 });
  const targets = (targetRows ?? []) as TargetRow[];
  if (targets.length === 0) {
    return Response.json({ mode, rescored: true, predictions: 0, manifests: 0, routes: 0, note: 'no active targets' });
  }

  // Fetch existing predictions to get any override_value
  const { data: existingPreds } = await admin
    .from('impact_predictions')
    .select('barangay_id, override_value')
    .in('barangay_id', targets.map((t) => t.barangay_id));
  const existingPredsMap = new Map<string, number | null>(
    (existingPreds ?? []).map((p) => [p.barangay_id, p.override_value])
  );

  // Latest CONFIRMED field report per target barangay → its population_estimate is the
  // ground-truth affected count, ranked above the model prediction (below a coordinator
  // override). Rows are ordered newest-first so the first seen per barangay is the latest.
  const { data: confirmedReports } = await admin
    .from('field_reports')
    .select('barangay_id, population_estimate, created_at')
    .eq('status', 'confirmed')
    .in('barangay_id', targets.map((t) => t.barangay_id))
    .order('created_at', { ascending: false });
  const reportedByBrgy = new Map<string, number>();
  for (const r of confirmedReports ?? []) {
    if (r.barangay_id && r.population_estimate != null && !reportedByBrgy.has(r.barangay_id)) {
      reportedByBrgy.set(r.barangay_id, Number(r.population_estimate));
    }
  }

  interface ExistingManifest {
    barangay_id: string;
    water_l: number | null;
    food_packs: number | null;
    shelter_kits: number | null;
    blankets: number | null;
    breakdown: { total_weight_kg?: number; lines?: unknown[] } | null;
    overridden: boolean;
    days: number;
    access_modifier: number;
  }

  // Fetch existing supply manifests to see if any are overridden
  const { data: existingManifests } = await admin
    .from('supply_manifests')
    .select('barangay_id, water_l, food_packs, shelter_kits, blankets, breakdown, overridden, days, access_modifier')
    .in('barangay_id', targets.map((t) => t.barangay_id));
  const existingManifestsMap = new Map<string, ExistingManifest>(
    (existingManifests ?? []).map((m) => [m.barangay_id, m as unknown as ExistingManifest])
  );

  // 4) Impact prediction (one batched call) -> upsert (preserve override_value).
  const features = targets.map((t) => toFeatures(t, categoryOrdinal));
  const impact = await predictImpact(features);
  const predByBrgy = new Map(impact.predictions.map((p) => [p.id as string, p]));

  const predictionRows = targets.map((t) => {
    const p = predByBrgy.get(t.barangay_id)!;
    const range = boundedAffectedRange(p, t.population);
    return {
      barangay_id: t.barangay_id,
      model: p.source === 'tabpfn' ? 'tabpfn' : 'heuristic',
      predicted_affected: boundedAffected(p, t.population),
      affected_low: range?.low ?? null,
      affected_high: range?.high ?? null,
      damage_severity: p.severity_class ?? severityFromDamageRate(p.damage_rate),
      confidence: Number(p.confidence.toFixed(3)),
      inputs: features.find((f) => f.id === t.barangay_id) ?? {},
      reported_affected: reportedByBrgy.get(t.barangay_id) ?? null,
      // A confirmed report supersedes the anticipatory forecast. Omitting this leaves the
      // Day-0 flag true on conflict, so the "Anticipatory — unconfirmed" chip never clears.
      is_day0: false,
    };
  });
  {
    const { error } = await admin.from('impact_predictions').upsert(predictionRows, { onConflict: 'barangay_id' });
    if (error) return Response.json({ error: `predictions: ${error.message}` }, { status: 500 });
  }

  // 5) Sphere manifest per barangay -> upsert. demand_kg feeds OR-Tools next.
  const demandByBrgy = new Map<string, number>();
  const manifestRows = [];
  for (const t of targets) {
    const affected = pickAffected({
      override: existingPredsMap.get(t.barangay_id),
      reported: reportedByBrgy.get(t.barangay_id),
      predicted: boundedAffected(predByBrgy.get(t.barangay_id)!, t.population),
    });

    const existingManifest = existingManifestsMap.get(t.barangay_id);
    if (existingManifest && existingManifest.overridden) {
      // Use the existing overridden manifest!
      const totalWeight = existingManifest.breakdown?.total_weight_kg ?? (
        Number(existingManifest.water_l ?? 0) * 1.0 +
        Number(existingManifest.food_packs ?? 0) * 0.6 +
        Number(existingManifest.shelter_kits ?? 0) * 5.0 +
        Number(existingManifest.blankets ?? 0) * 1.5
      );
      demandByBrgy.set(t.barangay_id, totalWeight);
      manifestRows.push({
        barangay_id: t.barangay_id,
        days: existingManifest.days,
        access_modifier: Number(existingManifest.access_modifier ?? 1.0),
        water_l: Number(existingManifest.water_l ?? 0),
        food_packs: Number(existingManifest.food_packs ?? 0),
        shelter_kits: Number(existingManifest.shelter_kits ?? 0),
        blankets: Number(existingManifest.blankets ?? 0),
        breakdown: existingManifest.breakdown,
        overridden: true,
      });
    } else {
      // Generate standard Sphere manifest using (possibly overridden) affected count
      const m = await buildManifest({ predicted_affected: affected, days: DAYS, id: t.barangay_id });
      demandByBrgy.set(t.barangay_id, m.total_weight_kg);
      const qty = (cat: string) => m.lines.find((l) => l.category === cat)?.quantity ?? 0;
      manifestRows.push({
        barangay_id: t.barangay_id,
        days: DAYS,
        access_modifier: m.access_modifier,
        water_l: qty('water'),
        food_packs: qty('food'),
        shelter_kits: m.lines.find((l) => l.item.toLowerCase().includes('tarp'))?.quantity ?? 0,
        blankets: m.lines.find((l) => l.item.toLowerCase().includes('blanket'))?.quantity ?? 0,
        breakdown: m,
        overridden: false,
      });
    }
  }
  {
    // `status` is deliberately absent from manifestRows: PostgREST only writes the
    // supplied columns on conflict, so a re-run refreshes quantities without resetting
    // the coordinator's review decision (same contract as override_value above).
    const { error } = await admin.from('supply_manifests').upsert(manifestRows, { onConflict: 'barangay_id' });
    if (error) return Response.json({ error: `manifests: ${error.message}` }, { status: 500 });
  }

  // 6) Depot + teams. Build the real-road cost matrix for [depot, ...targets].
  const { data: depot } = await admin.from('coordinator_facilities').select('latitude,longitude').eq('is_depot', true).maybeSingle();
  const { data: teamRows } = await admin.from('coordinator_teams').select('id,capacity_kg').not('capacity_kg', 'is', null);
  if (!depot || !teamRows || teamRows.length === 0) {
    return Response.json({ mode, rescored: true, predictions: predictionRows.length, manifests: manifestRows.length, routes: 0, note: 'no depot or teams' });
  }
  const points = [
    { lat: depot.latitude, lng: depot.longitude },
    ...targets.map((t) => ({ lat: t.lat, lng: t.lng })),
  ];
  const { data: cm, error: cmErr } = await admin.rpc('pipeline_cost_matrix', { p_points: points, p_speed_kmh: 30 });
  if (cmErr) return Response.json({ error: `cost_matrix: ${cmErr.message}` }, { status: 500 });
  const vids: number[] = cm.vids;
  const matrix: number[][] = cm.seconds;

  // 7) OR-Tools: depot is stop 0; demand from manifests; priority from Silent-Area score.
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

  // 8) Replace planned routes; persist each vehicle route with real-road geometry.
  {
    // A failed delete leaves the previous plan in place and stacks the new one on top —
    // duplicate routes on the map, from a query that returned no error to anyone.
    const { error } = await admin.from('routes').delete().eq('status', 'planned');
    if (error) return Response.json({ error: `clear planned routes: ${error.message}` }, { status: 500 });
  }
  let routeCount = 0;
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
      routeCount += 1;
    }
  }

  const payload = {
    mode,
    rescored: true,
    predictions: predictionRows.length,
    manifests: manifestRows.length,
    routes: routeCount,
    dropped: solved.dropped_stop_ids,
    solver_status: solved.solver_status,
    ...(saveErrors.length > 0
      ? { note: `${saveErrors.length} of ${attempted} route saves failed — ${saveErrors[0]}` }
      : {}),
  };
  // Nothing persisted at all is a failed run, not a thin one.
  if (attempted > 0 && routeCount === 0) {
    return Response.json({ ...payload, error: `route save: ${saveErrors[0]}` }, { status: 500 });
  }
  return Response.json(payload);
}
