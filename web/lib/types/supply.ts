// Sphere supply engine API contract.
// MIRRORS ai-services/app/models/supply.py (the canonical source). Any change to one
// must update the other in the SAME commit (see CLAUDE.md > Rules).

export type SupplyCategory = "water" | "food" | "shelter" | "nfi";

/** Inputs to the Sphere supply engine. */
export interface SupplyManifestRequest {
  /** People needing relief (e.g. TabPFN `affected`). >= 0. */
  predicted_affected: number;
  /** Provisioning horizon in days. >= 1. */
  days: number;
  /** Scales every supplied quantity for access constraints
   *  (1.0 = full; 0.5 = half deliverable; 1.2 = +20% buffer). >= 0. Defaults to 1.0. */
  access_modifier?: number;
  /** Caller key, echoed back on the manifest. */
  id?: string | null;
}

/** One supply line, fully traceable to the inputs that produced it. */
export interface SupplyLine {
  item: string;
  category: SupplyCategory;
  /** Unit of `quantity`, e.g. L, ration packs, blankets. */
  unit: string;
  /** Quantity to deliver (post access modifier). */
  quantity: number;
  /** Logistics weight per unit. */
  unit_weight_kg: number;
  /** quantity * unit_weight_kg (cargo demand for OR-Tools). */
  weight_kg: number;
  /** Human-readable formula behind `quantity`. */
  basis: string;
  /** Every multiplicand used (incl. access_modifier) for audit. */
  inputs: Record<string, number>;
}

/** A complete, auditable relief manifest for one affected population. */
export interface SupplyManifest {
  predicted_affected: number;
  days: number;
  access_modifier: number;
  /** ceil(affected / persons_per_household). */
  households: number;
  lines: SupplyLine[];
  /** Sum of line weights (cargo demand). */
  total_weight_kg: number;
  /** The Sphere/IFRC constants used, for audit. */
  standards: Record<string, number>;
  id?: string | null;
}
