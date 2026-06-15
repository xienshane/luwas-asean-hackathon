import type { BarangayFeatures, PredictImpactResponse } from '@/lib/types/impact';

// Thin wrapper for ai-services POST /predict-impact (TabPFN, heuristic fallback live there).
// 20s timeout: a warm HF Space answers in ~1-3s; pre-warm before demos.
export async function predictImpact(features: BarangayFeatures[]): Promise<PredictImpactResponse> {
  const base = process.env.AI_SERVICE_URL;
  if (!base) throw new Error('AI_SERVICE_URL is not set');

  const res = await fetch(`${base.replace(/\/$/, '')}/predict-impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`predict-impact responded ${res.status}`);
  return (await res.json()) as PredictImpactResponse;
}
