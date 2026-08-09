import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { predictImpact } from '@/lib/ai/impact';
import { buildManifest } from '@/lib/ai/supply';
import { toFeatures, severityFromDamageRate, boundedAffected, boundedAffectedRange, type TargetRow } from '@/lib/pipeline/features';
import { pickAffected } from '@/lib/pipeline/affected';
import { parsePipelineMode } from '@/lib/pipeline/mode';
import { mapWithConcurrency } from '@/lib/pipeline/concurrency';
import { manifestDemandKg, type ManifestQuantities } from '@/lib/pipeline/manifestDemand';
import { planAndSaveRoutes, type PlanRoutesResult } from '@/lib/pipeline/routes';

const DAYS = 3;
const MAX_TARGETS = 10;
const MANIFEST_CONCURRENCY = 8; // deterministic formula behind one HTTP hop; bound the sockets.

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
  // Every response echoes the mode it ran.
  const mode = parsePipelineMode(body);

  const admin = createAdminClient();

  // Reroute fast path: blocking a road changes the graph, not the need. Predictions and
  // manifests are already persisted and contact recency has not moved, so this skips the
  // rescore and both AI stages — and therefore still works with TabPFN and SEA-LION down.
  if (mode === 'reroute') {
    // Dispatched (status 'active') routes are invisible to planAndSaveRoutes, which only
    // regenerates 'planned' ones — so a convoy already rolling would keep drawing its line
    // straight through the road that was just closed. Rebuild those first, and do it before
    // the no-manifests early return: a graph change invalidates a rolling route whether or
    // not there is anything left to plan. The block already landed, so a failure here is
    // reported, never swallowed.
    let reroutedActive = 0;
    let activeNote: string | undefined;
    {
      const { data: n, error } = await admin.rpc('reroute_active_dispatch_routes');
      if (error) {
        console.error('reroute_active_dispatch_routes failed', error);
        activeNote = `active dispatch routes not redrawn — ${error.message}`;
      } else if (typeof n === 'number') {
        reroutedActive = n;
      }
    }

    const { data: targetRows, error: tErr } = await admin.rpc('pipeline_targets', {
      p_barangay_id: null, p_limit: MAX_TARGETS,
    });
    if (tErr) return Response.json({ error: `targets: ${tErr.message}` }, { status: 500 });
    const targets = (targetRows ?? []) as TargetRow[];

    const { data: stored } = await admin
      .from('supply_manifests')
      .select('barangay_id, water_l, food_packs, shelter_kits, blankets, breakdown')
      .in('barangay_id', targets.map((t) => t.barangay_id));

    const demandByBrgy = new Map<string, number>();
    for (const m of (stored ?? []) as (ManifestQuantities & { barangay_id: string })[]) {
      demandByBrgy.set(m.barangay_id, manifestDemandKg(m));
    }
    const routable = targets.filter((t) => demandByBrgy.has(t.barangay_id));
    if (routable.length === 0) {
      const base = 'no stored manifests to re-plan; run the full pipeline first';
      return Response.json({
        mode, rescored: false, predictions: 0, manifests: 0, routes: 0, reroutedActive,
        note: [reroutedActive > 0 ? `${reroutedActive} active route(s) redrawn` : base, activeNote]
          .filter(Boolean).join('; '),
      });
    }

    const plan = await planAndSaveRoutes(admin, routable, demandByBrgy);
    const skipped = targets.length - routable.length;
    const extraNotes = [
      skipped > 0 ? `${skipped} target(s) skipped: no stored manifest` : null,
      activeNote,
    ].filter(Boolean) as string[];
    if (extraNotes.length > 0) {
      plan.note = [plan.note, ...extraNotes].filter(Boolean).join('; ');
    }
    return respond({
      mode, rescored: false, predictions: 0, manifests: routable.length, plan, reroutedActive,
    });
  }

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
  interface ManifestUpsertRow {
    barangay_id: string; days: number; access_modifier: number;
    water_l: number; food_packs: number; shelter_kits: number; blankets: number;
    breakdown: unknown; overridden: boolean;
  }

  const built = await mapWithConcurrency(targets, MANIFEST_CONCURRENCY, async (t) => {
    const affected = pickAffected({
      override: existingPredsMap.get(t.barangay_id),
      reported: reportedByBrgy.get(t.barangay_id),
      predicted: boundedAffected(predByBrgy.get(t.barangay_id)!, t.population),
    });

    const existingManifest = existingManifestsMap.get(t.barangay_id);
    if (existingManifest && existingManifest.overridden) {
      // A coordinator override is authoritative: reuse it verbatim, never rebuild over it.
      const row: ManifestUpsertRow = {
        barangay_id: t.barangay_id,
        days: existingManifest.days,
        access_modifier: Number(existingManifest.access_modifier ?? 1.0),
        water_l: Number(existingManifest.water_l ?? 0),
        food_packs: Number(existingManifest.food_packs ?? 0),
        shelter_kits: Number(existingManifest.shelter_kits ?? 0),
        blankets: Number(existingManifest.blankets ?? 0),
        breakdown: existingManifest.breakdown,
        overridden: true,
      };
      return { demandKg: manifestDemandKg(existingManifest), row };
    }

    const m = await buildManifest({ predicted_affected: affected, days: DAYS, id: t.barangay_id });
    const qty = (cat: string) => m.lines.find((l) => l.category === cat)?.quantity ?? 0;
    const row: ManifestUpsertRow = {
      barangay_id: t.barangay_id,
      days: DAYS,
      access_modifier: m.access_modifier,
      water_l: qty('water'),
      food_packs: qty('food'),
      shelter_kits: m.lines.find((l) => l.item.toLowerCase().includes('tarp'))?.quantity ?? 0,
      blankets: m.lines.find((l) => l.item.toLowerCase().includes('blanket'))?.quantity ?? 0,
      breakdown: m,
      overridden: false,
    };
    return { demandKg: m.total_weight_kg, row };
  });

  const demandByBrgy = new Map<string, number>(
    built.map((b, i) => [targets[i].barangay_id, b.demandKg]),
  );
  const manifestRows = built.map((b) => b.row);
  {
    // `status` is deliberately absent from manifestRows: PostgREST only writes the
    // supplied columns on conflict, so a re-run refreshes quantities without resetting
    // the coordinator's review decision (same contract as override_value above).
    const { error } = await admin.from('supply_manifests').upsert(manifestRows, { onConflict: 'barangay_id' });
    if (error) return Response.json({ error: `manifests: ${error.message}` }, { status: 500 });
  }

  const plan = await planAndSaveRoutes(admin, targets, demandByBrgy);
  return respond({
    mode, rescored: true,
    predictions: predictionRows.length,
    manifests: manifestRows.length,
    plan,
  });
}

/** One response shape for both modes; `plan.error` means nothing persisted -> 500. */
function respond(o: {
  mode: string; rescored: boolean; predictions: number; manifests: number;
  plan: PlanRoutesResult;
  /** Dispatched routes rebuilt against the current graph (reroute mode only). */
  reroutedActive?: number;
}) {
  const payload = {
    mode: o.mode,
    rescored: o.rescored,
    predictions: o.predictions,
    manifests: o.manifests,
    routes: o.plan.routes,
    ...(o.reroutedActive !== undefined ? { reroutedActive: o.reroutedActive } : {}),
    ...(o.plan.dropped ? { dropped: o.plan.dropped } : {}),
    ...(o.plan.solverStatus ? { solver_status: o.plan.solverStatus } : {}),
    ...(o.plan.note ? { note: o.plan.note } : {}),
  };
  return o.plan.error
    ? Response.json({ ...payload, error: o.plan.error }, { status: 500 })
    : Response.json(payload);
}
