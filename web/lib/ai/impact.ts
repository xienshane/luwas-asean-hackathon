import type { BarangayFeatures, PredictImpactResponse } from '@/lib/types/impact';
import { postAiJson } from './fetchJson';

// TabPFN impact prediction (heuristic fallback lives in the service).
export function predictImpact(features: BarangayFeatures[]): Promise<PredictImpactResponse> {
  return postAiJson<PredictImpactResponse>('/predict-impact', { features }, 'predict-impact');
}
