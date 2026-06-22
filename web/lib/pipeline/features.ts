import type { BarangayFeatures, ImpactPrediction, SeverityClass } from '@/lib/types/impact';

// Matches ai-services AVG_HOUSEHOLD_SIZE so derived houses align with the heuristic path.
export const AVG_HOUSEHOLD_SIZE = 4.1;

export interface TargetRow {
  barangay_id: string;
  name: string;
  province: string | null;
  population: number | null;
  lat: number;
  lng: number;
  score: number;
  province_housing_units: number | null;
  province_households: number | null;
  structural_vuln_frac: number | null;
  unimproved_water_frac: number | null;
}

// Build the 6 TabPFN features for one barangay under a given storm intensity.
export function toFeatures(row: TargetRow, categoryOrdinal: number): BarangayFeatures {
  const population = row.population ?? 0;
  return {
    category_ordinal: categoryOrdinal,
    total_houses: Math.max(0, Math.round(population / AVG_HOUSEHOLD_SIZE)),
    province_housing_units: row.province_housing_units ?? 0,
    province_households: row.province_households ?? 0,
    structural_vuln_frac: row.structural_vuln_frac ?? 0,
    unimproved_water_frac: row.unimproved_water_frac ?? 0,
    id: row.barangay_id,
  };
}

// Mirror of ai-services severity_class() bins, for the regressor framing.
export function severityFromDamageRate(rate: number | null | undefined): SeverityClass {
  if (rate == null) return 'moderate';
  if (rate < 0.05) return 'low';
  if (rate < 0.2) return 'moderate';
  if (rate < 0.5) return 'high';
  return 'severe';
}

// Representative damage_rate per severity class (midpoints of the severity_class() bins),
// used only when the continuous damage_rate is absent (classifier framing).
const SEVERITY_RATE: Record<SeverityClass, number> = {
  low: 0.025, moderate: 0.125, high: 0.35, severe: 0.6,
};

// Operational affected-population estimate, bounded by the barangay's own population.
//
// The model's `affected` head is trained at PROVINCE granularity (the Phase 1.3 training table
// is one row per province-event), so applied to a single barangay it routinely exceeds that
// barangay's population. For the pipeline we instead derive affected from the bounded
// damage_rate head times the barangay population, clamped to [0, population]. This keeps the
// operational number (and the Sphere manifest it drives) sane WITHOUT touching the model or the
// Phase 5.1 validation, which still scores damage_rate at province granularity.
export function boundedAffected(
  p: Pick<ImpactPrediction, 'affected' | 'damage_rate' | 'severity_class'>,
  population: number | null | undefined,
): number {
  const pop = Math.max(0, Math.round(population ?? 0));
  const rate = p.damage_rate ?? (p.severity_class != null ? SEVERITY_RATE[p.severity_class] : null);
  // Fallback (no severity signal at all): clamp the raw province-scale count to population.
  if (rate == null) return Math.min(Math.max(0, Math.round(p.affected)), pop);
  return Math.min(pop, Math.max(0, Math.round(rate * pop)));
}

// Operational 80% interval for the bounded affected estimate (Phase 4.3).
//
// The point estimate (boundedAffected) derives affected from `damage_rate * population`,
// so its interval comes from the same mapping applied to the damage_rate quantiles —
// NOT the model's province-scale `affected_low`/`affected_high`, which would overshoot a
// single barangay. Returns null when no continuous damage_rate interval exists (heuristic
// path or classifier framing); the UI then shows the point estimate without a range.
export function boundedAffectedRange(
  p: Pick<ImpactPrediction, 'damage_rate_low' | 'damage_rate_high' | 'affected_low' | 'affected_high' | 'severity_class'>,
  population: number | null | undefined,
): { low: number; high: number } | null {
  const lo = p.damage_rate_low, hi = p.damage_rate_high;
  if (lo == null || hi == null) return null;
  const pop = Math.max(0, Math.round(population ?? 0));
  const bound = (rate: number) => Math.min(pop, Math.max(0, Math.round(rate * pop)));
  const low = bound(lo);
  return { low, high: Math.max(low, bound(hi)) };
}
