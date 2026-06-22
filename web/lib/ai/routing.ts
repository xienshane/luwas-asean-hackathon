import type { OptimizeRoutesRequest, OptimizeRoutesResponse } from '@/lib/types/routing';

export async function optimizeRoutes(req: OptimizeRoutesRequest): Promise<OptimizeRoutesResponse> {
  const base = process.env.AI_SERVICE_URL;
  if (!base) throw new Error('AI_SERVICE_URL is not set');

  const res = await fetch(`${base.replace(/\/$/, '')}/optimize-routes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`optimize-routes responded ${res.status}`);
  return (await res.json()) as OptimizeRoutesResponse;
}
