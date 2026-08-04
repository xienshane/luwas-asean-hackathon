// Sphere line weights, kg per unit — mirrors ai-services build-manifest. Only used as a
// fallback: a manifest written before `breakdown.total_weight_kg` existed, or overridden
// by a coordinator without one, still has to produce a cargo mass for OR-Tools.
const UNIT_KG = { water_l: 1.0, food_packs: 0.6, shelter_kits: 5.0, blankets: 1.5 } as const;

export interface ManifestQuantities {
  water_l: number | null;
  food_packs: number | null;
  shelter_kits: number | null;
  blankets: number | null;
  breakdown: { total_weight_kg?: number } | null;
}

/** Cargo mass OR-Tools must fit for this barangay. The stored total wins; else sum the lines. */
export function manifestDemandKg(m: ManifestQuantities): number {
  const stored = m.breakdown?.total_weight_kg;
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  return Number(m.water_l ?? 0) * UNIT_KG.water_l
    + Number(m.food_packs ?? 0) * UNIT_KG.food_packs
    + Number(m.shelter_kits ?? 0) * UNIT_KG.shelter_kits
    + Number(m.blankets ?? 0) * UNIT_KG.blankets;
}
