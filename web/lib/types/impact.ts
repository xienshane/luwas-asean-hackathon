// Impact predictor API contract.
// MIRRORS ai-services/app/models/impact.py (the canonical source). Any change to one
// must update the other in the SAME commit (see CLAUDE.md > Rules).

export type ModelFraming = "regressor" | "classifier";
export type SeverityClass = "low" | "moderate" | "high" | "severe";
export type PredictionSource = "tabpfn" | "heuristic";

/** One feature row, matching the Phase 1.3 training table's model inputs. */
export interface BarangayFeatures {
  /** PAGASA intensity: 0 TD .. 5 violent typhoon. */
  category_ordinal: number;
  total_houses: number;
  province_housing_units: number;
  province_households: number;
  /** 1 − strong-roof&wall share of housing, [0,1]. */
  structural_vuln_frac: number;
  /** share on natural/peddler water sources, [0,1]. */
  unimproved_water_frac: number;
  /** caller key, echoed back; unused by the model. */
  id?: string | null;
}

export interface PredictImpactRequest {
  features: BarangayFeatures[];
}

/** One prediction, aligned by order to the request's `features`. */
export interface ImpactPrediction {
  affected: number;
  affected_confidence: number;
  /** 80% predictive interval for `affected` (0.1/0.9 quantiles). Null on the heuristic
   *  path (no interval). Decision support, not a guarantee. */
  affected_low: number | null;
  affected_high: number | null;
  /** Set in regressor framing; null in classifier framing. */
  damage_rate: number | null;
  damage_rate_confidence: number | null;
  /** 80% predictive interval for `damage_rate`; regressor framing only. */
  damage_rate_low: number | null;
  damage_rate_high: number | null;
  /** Set in classifier framing; null in regressor framing. */
  severity_class: SeverityClass | null;
  severity_confidence: number | null;
  /** Overall = min of the reported heads. */
  confidence: number;
  source: PredictionSource;
  id?: string | null;
}

export interface PredictImpactResponse {
  predictions: ImpactPrediction[];
  model_framing: ModelFraming;
  latency_ms: number;
}
