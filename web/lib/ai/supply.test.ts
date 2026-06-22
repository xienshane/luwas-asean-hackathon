import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildManifest } from './supply';

afterEach(() => vi.restoreAllMocks());

it('POSTs to /build-manifest and returns a manifest', async () => {
  process.env.AI_SERVICE_URL = 'http://ai.test';
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    predicted_affected: 1000, days: 3, access_modifier: 1, households: 200,
    lines: [{ item: 'Drinking water', category: 'water', unit: 'L', quantity: 45000,
              unit_weight_kg: 1, weight_kg: 45000, basis: '...', inputs: {} }],
    total_weight_kg: 45000, standards: {},
  }), { status: 200 }));
  const m = await buildManifest({ predicted_affected: 1000, days: 3 });
  expect(m.total_weight_kg).toBe(45000);
});
