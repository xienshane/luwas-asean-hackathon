import type { ImpactPrediction } from '@/lib/types/coordinator';

// Phase 4.3 uncertainty rule, extracted to a tested pure helper (Phase 6.1).
// "Sparse data" predictions — the heuristic fallback (no TabPFN context) and
// wide-interval cases — surface as low-confidence decision support. Day-0
// forecasts carry their own separate badge in RightIntelligencePanel.

/** True when the 80% predictive spread exceeds the point estimate (high uncertainty). */
export function isWideInterval(p: ImpactPrediction): boolean {
  return (
    p.affectedLow != null &&
    p.affectedHigh != null &&
    p.predictedAffected > 0 &&
    p.affectedHigh - p.affectedLow > p.predictedAffected
  );
}

/**
 * Human-readable reason a prediction should render as low-confidence decision
 * support, or null when it is confident. Precedence (matches the 4.3 tooltip):
 * heuristic fallback → wide interval → low model confidence.
 */
export function lowConfidenceReason(p: ImpactPrediction | null | undefined): string | null {
  if (!p) return null;
  if (p.model === 'Heuristic') {
    return 'Heuristic fallback (no model interval). Treat as rough decision support, not fact.';
  }
  if (isWideInterval(p)) {
    return 'Wide predictive interval — high uncertainty. Treat as decision support, not fact.';
  }
  if (p.confidence === 'low') {
    return 'Low model confidence. Treat as decision support, not fact.';
  }
  return null;
}
