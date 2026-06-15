import type { SupplyManifest, SupplyManifestRequest } from '@/lib/types/supply';

export async function buildManifest(req: SupplyManifestRequest): Promise<SupplyManifest> {
  const base = process.env.AI_SERVICE_URL;
  if (!base) throw new Error('AI_SERVICE_URL is not set');

  const res = await fetch(`${base.replace(/\/$/, '')}/build-manifest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_modifier: 1, ...req }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`build-manifest responded ${res.status}`);
  return (await res.json()) as SupplyManifest;
}
