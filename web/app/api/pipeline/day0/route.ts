import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { predictImpact } from '@/lib/ai/impact';
import { buildManifest } from '@/lib/ai/supply';
import { toFeatures, severityFromDamageRate, type TargetRow } from '@/lib/pipeline/features';

const DAYS = 3;
const MAX_TARGETS = 50;
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

  const admin = createAdminClient();

  // 2) Rescore Silent Areas first so target priority reflects current exposure.
  {
    const { error } = await admin.rpc('silent_area_score');
    if (error) return Response.json({ error: `rescore: ${error.message}` }, { status: 500 });
  }

  // 3) Day-0 target set: top barangays by Silent-Area score, NO report requirement.
  const { data: targetRows, error: tErr } = await admin.rpc('pipeline_targets_day0', { p_limit: limit });
  if (tErr) return Response.json({ error: `targets: ${tErr.message}` }, { status: 500 });
  const targets = (targetRows ?? []) as TargetRow[];
  if (targets.length === 0) {
    return Response.json({ rescored: true, predictions: 0, manifests: 0, note: 'no eligible barangays' });
  }

  // 4) Impact prediction (one batched call) -> upsert, flagged is_day0. override_value is
  //    omitted so any prior coordinator override survives the upsert.
  const features = targets.map((t) => toFeatures(t, categoryOrdinal));
  const impact = await predictImpact(features);
  const predByBrgy = new Map(impact.predictions.map((p) => [p.id as string, p]));

  const predictionRows = targets.map((t) => {
    const p = predByBrgy.get(t.barangay_id)!;
    return {
      barangay_id: t.barangay_id,
      model: p.source === 'tabpfn' ? 'tabpfn' : 'heuristic',
      predicted_affected: p.affected,
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
  const manifestRows = targets.map((t) => {
    const affected = predByBrgy.get(t.barangay_id)!.affected;
    return { barangay_id: t.barangay_id, affected };
  });
  const builtManifests = await Promise.all(
    manifestRows.map((r) => buildManifest({ predicted_affected: r.affected, days: DAYS, id: r.barangay_id })),
  );
  const manifestUpsert = manifestRows.map((r, i) => {
    const m = builtManifests[i];
    const qty = (cat: string) => m.lines.find((l) => l.category === cat)?.quantity ?? 0;
    return {
      barangay_id: r.barangay_id,
      days: DAYS,
      access_modifier: m.access_modifier,
      water_l: qty('water'),
      food_packs: qty('food'),
      shelter_kits: m.lines.find((l) => l.item.toLowerCase().includes('tarp'))?.quantity ?? 0,
      blankets: m.lines.find((l) => l.item.toLowerCase().includes('blanket'))?.quantity ?? 0,
      breakdown: m,
      overridden: false,
    };
  });
  {
    const { error } = await admin.from('supply_manifests').upsert(manifestUpsert, { onConflict: 'barangay_id' });
    if (error) return Response.json({ error: `manifests: ${error.message}` }, { status: 500 });
  }

  return Response.json({
    rescored: true,
    predictions: predictionRows.length,
    manifests: manifestUpsert.length,
    category_ordinal: categoryOrdinal,
    source: impact.predictions[0]?.source ?? 'heuristic',
  });
}
