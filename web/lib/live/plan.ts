import type { Route, ImpactPrediction, SupplyManifest } from '@/lib/types/coordinator';

interface RouteStopRow {
  sequence: number; barangayId: string; barangayName: string; action: string;
}
export interface RouteRow {
  id: string; team_id: string | null; team_name: string | null; status: string;
  total_distance_m: number | null; stops: RouteStopRow[] | null;
  geometry: { type: string; coordinates: number[][] } | null;
}
export function routeRowToUi(r: RouteRow): Route {
  const path = (r.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
  return {
    id: r.id, teamId: r.team_id ?? '', teamName: r.team_name ?? '',
    status: (['planned', 'active', 'completed'].includes(r.status) ? r.status : 'planned') as Route['status'],
    stops: (r.stops ?? []).map((s) => ({
      sequence: s.sequence, barangayId: s.barangayId, barangayName: s.barangayName, action: s.action,
    })),
    totalDistanceM: Number(r.total_distance_m ?? 0), path,
  };
}

const SEV_DB_TO_UI: Record<string, ImpactPrediction['damageSeverity']> = {
  severe: 'severe', high: 'moderate', moderate: 'minor', low: 'minor',
};
const CONF_TO_UI = (c: number): ImpactPrediction['confidence'] => (c >= 0.66 ? 'high' : c >= 0.33 ? 'moderate' : 'low');

export interface PredictionRow {
  barangay_id: string; model: string; predicted_affected: number | null;
  affected_low?: number | null; affected_high?: number | null;
  damage_severity: string | null; confidence: number | null; override_value: number | null;
  inputs: Record<string, unknown> | null;
  reported_affected?: number | null;
  is_day0?: boolean | null;
}
export function predictionRowToUi(r: PredictionRow): ImpactPrediction {
  return {
    barangayId: r.barangay_id, model: r.model === 'tabpfn' ? 'TabPFN v2' : 'Heuristic',
    predictedAffected: Number(r.predicted_affected ?? 0),
    affectedLow: r.affected_low ?? null,
    affectedHigh: r.affected_high ?? null,
    damageSeverity: SEV_DB_TO_UI[r.damage_severity ?? 'moderate'] ?? 'minor',
    confidence: CONF_TO_UI(Number(r.confidence ?? 0)),
    overrideValue: r.override_value,
    reportedAffected: r.reported_affected ?? null,
    contributors: [],
    isDay0: r.is_day0 === true,
  };
}

interface ManifestLine { item?: string; quantity?: number }
export interface ManifestRow {
  barangay_id: string; days: number; water_l: number | null; food_packs: number | null;
  shelter_kits: number | null; blankets: number | null;
  breakdown: { lines?: ManifestLine[]; total_weight_kg?: number } | null; overridden: boolean;
  status?: string | null;
}
const MANIFEST_STATUSES: SupplyManifest['status'][] = ['pending', 'approved', 'modified', 'rejected'];
export function manifestRowToUi(r: ManifestRow): SupplyManifest {
  const item = (recommended: number) => ({ recommended, inventory: 0, shortfall: recommended });
  const water = Number(r.water_l ?? 0), food = Number(r.food_packs ?? 0);
  const hygiene = (r.breakdown?.lines ?? []).find((l) => l.item?.toLowerCase().includes('hygiene'))?.quantity ?? 0;
  return {
    barangayId: r.barangay_id, days: r.days,
    // Persisted review status wins; rows written before the column existed fall back to
    // the override flag. The pipeline upsert omits `status`, so runs never reset a review.
    status: MANIFEST_STATUSES.includes(r.status as SupplyManifest['status'])
      ? (r.status as SupplyManifest['status'])
      : (r.overridden ? 'modified' : 'pending'),
    waterL: item(water), foodPacks: item(food),
    blankets: item(Number(r.blankets ?? 0)),
    hygieneKits: item(hygiene), medicalSupplies: item(0),
    shelterMaterials: item(Number(r.shelter_kits ?? 0)),
    totalWeightKg: r.breakdown?.total_weight_kg ?? null,
    overridden: r.overridden,
  };
}
