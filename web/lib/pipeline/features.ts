import type { BarangayFeatures, SeverityClass } from '@/lib/types/impact';

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
