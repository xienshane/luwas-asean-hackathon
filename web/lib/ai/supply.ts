import type { SupplyManifest, SupplyManifestRequest } from '@/lib/types/supply';
import { postAiJson } from './fetchJson';

// Deterministic Sphere formula — no model. access_modifier defaults to 1 (normal access).
export function buildManifest(req: SupplyManifestRequest): Promise<SupplyManifest> {
  return postAiJson<SupplyManifest>('/build-manifest', { access_modifier: 1, ...req }, 'build-manifest');
}
