import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { predictImpact } from '@/lib/ai/impact';
import { buildManifest } from '@/lib/ai/supply';
import { toFeatures, severityFromDamageRate, boundedAffected, boundedAffectedRange, type TargetRow } from '@/lib/pipeline/features';
import { mapWithConcurrency } from '@/lib/pipeline/concurrency';
import { isRegionId } from '@/lib/regions';

const DAYS = 3;
const MAX_TARGETS = 50;
const MANIFEST_CONCURRENCY = 8; // deterministic formula behind one HTTP hop; bound the sockets.
const DEFAULT_CATEGORY = 4; // PAGASA intensity assumed when the coordinator picks no scenario.

// Day-0 forecast: run TabPFN impact + Sphere manifests across communities BEFORE any
// field report exists. Unlike /api/pipeline (report-gated via pipeline_targets), this uses
// pipeline_targets_day0 — top barangays by Silent-Area score, no report dependency. Output
// is labelled `is_day0` so the console renders it as "Predicted — Unconfirmed (Day 0)".
// Predictions stay coordinator-override-able (override_value is never written here) and this
// never generates routes or dispatches — it is assistive scenario planning only.
export async function POST(request: Request) {
  // 1) AuthZ: only a signed-in coordinator may trigger the (compute-heavy) forecast.
  const ssr = await createClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: isCoord } = await ssr.rpc('is_coordinator');
  if (!isCoord) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const categoryOrdinal: number = Number.isFinite(body?.categoryOrdinal) ? body.categoryOrdinal : DEFAULT_CATEGORY;
  const limit: number = Number.isFinite(body?.limit) ? body.limit : MAX_TARGETS;
  // Confine the forecast to the pack on screen. Scores are min-max normalised across all
  // rows, so ranking a Vietnamese ward against a Philippine barangay compares positions in
  // a shared distribution rather than need — an unscoped run from Đà Nẵng returned fifty
  // Cebu barangays and no Vietnamese ones. An unknown value falls back to null (global),
  // which is the pre-region behaviour.
  const region: string | null = isRegionId(body?.region) ? body.region : null;

  const admin = createAdminClient();

  // 2) Rescore Silent Areas first so target priority reflects current exposure.
  {
    const { error } = await admin.rpc('silent_area_score');
    if (error) return Response.json({ error: `rescore: ${error.message}` }, { status: 500 });
  }

  // 3) Day-0 target set: top barangays by Silent-Area score, NO report requirement.
  const { data: targetRows, error: tErr } = await admin.rpc('pipeline_targets_day0', {
    p_limit: limit,
    p_region: region,
  });
  if (tErr) return Response.json({ error: `targets: ${tErr.message}` }, { status: 500 });
  const targets = (targetRows ?? []) as TargetRow[];
  if (targets.length === 0) {
    return Response.json({ rescored: true, predictions: 0, manifests: 0, note: 'no eligible barangays' });
  }

  // Fetch existing predictions to get any override_value
  const { data: existingPreds } = await admin
    .from('impact_predictions')
    .select('barangay_id, override_value')
    .in('barangay_id', targets.map((t) => t.barangay_id));
  const existingPredsMap = new Map<string, number | null>(
    (existingPreds ?? []).map((p) => [p.barangay_id, p.override_value])
  );

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

  // 4) Impact prediction (one batched call) -> upsert, flagged is_day0. override_value is
  //    omitted so any prior coordinator override survives the upsert.
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
      is_day0: true,
    };
  });
  {
    const { error } = await admin.from('impact_predictions').upsert(predictionRows, { onConflict: 'barangay_id' });
    if (error) return Response.json({ error: `predictions: ${error.message}` }, { status: 500 });
  }

  // 5) Sphere manifest per barangay -> upsert. Deterministic, coordinator-override-able.
  interface ManifestUpsertRow {
    barangay_id: string; days: number; access_modifier: number;
    water_l: number; food_packs: number; shelter_kits: number; blankets: number;
    breakdown: unknown; overridden: boolean;
  }

  const manifestUpsert: ManifestUpsertRow[] = await mapWithConcurrency(
    targets,
    MANIFEST_CONCURRENCY,
    async (t) => {
      const existingPred = existingPredsMap.get(t.barangay_id);
      const affected = (existingPred !== null && existingPred !== undefined)
        ? existingPred
        : boundedAffected(predByBrgy.get(t.barangay_id)!, t.population);

      const existingManifest = existingManifestsMap.get(t.barangay_id);
      if (existingManifest && existingManifest.overridden) {
        return {
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
      }

      const m = await buildManifest({ predicted_affected: affected, days: DAYS, id: t.barangay_id });
      const qty = (cat: string) => m.lines.find((l) => l.category === cat)?.quantity ?? 0;
      return {
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
    },
  );
  {
    const { error } = await admin.from('supply_manifests').upsert(manifestUpsert, { onConflict: 'barangay_id' });
    if (error) return Response.json({ error: `manifests: ${error.message}` }, { status: 500 });
  }

  return Response.json({
    rescored: true,
    predictions: predictionRows.length,
    manifests: manifestUpsert.length,
    category_ordinal: categoryOrdinal,
    region,
    source: impact.predictions[0]?.source ?? 'heuristic',
  });
}
