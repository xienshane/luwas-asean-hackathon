// The affected-count precedence rule, shared by the pipeline (recomputes the Sphere
// manifest) and the coordinator UI (displays the number). Precedence, highest first:
//   coordinator override > latest CONFIRMED field report > TabPFN prediction.
// All AI output is assistive, so a human override always wins (CLAUDE.md).

export interface AffectedInputs {
  /** Coordinator override (impact_predictions.override_value). */
  override?: number | null;
  /** Latest confirmed field report's population_estimate for the barangay. */
  reported?: number | null;
  /** Model prediction (bounded predicted_affected). */
  predicted?: number | null;
}

/** The affected count to plan supplies from / display. 0 is a valid value, not "absent". */
export function pickAffected({ override, reported, predicted }: AffectedInputs): number {
  if (override != null) return override;
  if (reported != null) return reported;
  return predicted ?? 0;
}

/** Which input won — for labeling the UI ("Reported" vs "Predicted" vs "Overridden"). */
export function affectedSource({ override, reported, predicted }: AffectedInputs):
  'override' | 'reported' | 'predicted' | 'none' {
  if (override != null) return 'override';
  if (reported != null) return 'reported';
  if (predicted != null) return 'predicted';
  return 'none';
}
