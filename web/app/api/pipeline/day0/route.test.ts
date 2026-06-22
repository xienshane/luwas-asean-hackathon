import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth/admin clients and AI wrappers so we test Day-0 orchestration, not I/O.
const calls: string[] = [];
const upserts: Record<string, Record<string, unknown>[]> = {};
const rpc = vi.fn(async (fn: string) => {
  calls.push(`rpc:${fn}`);
  if (fn === 'pipeline_targets_day0') return { data: [{
    barangay_id: 'b1', name: 'Lahug', province: 'Cebu', population: 25000, lat: 10.33, lng: 123.9,
    score: 0.7, province_housing_units: 1058512, province_households: 1077180,
    structural_vuln_frac: 0.395, unimproved_water_frac: 0.0779 }], error: null };
  if (fn === 'silent_area_score') return { data: 1, error: null };
  return { data: null, error: null };
});
const fromFn = vi.fn((table: string) => ({
  upsert: vi.fn(async (rows: Record<string, unknown>[]) => { calls.push(`upsert:${table}`); upserts[table] = rows; return { error: null }; }),
  select: () => ({
    in: async () => ({ data: [], error: null }),
  })
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc, from: fromFn }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  rpc: async () => ({ data: true, error: null }), // is_coordinator
}) }));
vi.mock('@/lib/ai/impact', () => ({ predictImpact: async () => ({
  predictions: [{ affected: 500, affected_confidence: 0.8, damage_rate: 0.3, confidence: 0.8, source: 'tabpfn', id: 'b1' }],
  model_framing: 'regressor', latency_ms: 1 }) }));
vi.mock('@/lib/ai/supply', () => ({ buildManifest: async () => ({
  predicted_affected: 500, days: 3, access_modifier: 1, households: 100,
  lines: [{ item: 'Drinking water', category: 'water', unit: 'L', quantity: 22500, unit_weight_kg: 1, weight_kg: 22500, basis: '', inputs: {} }],
  total_weight_kg: 22500, standards: {} }) }));

beforeEach(() => { calls.length = 0; for (const k of Object.keys(upserts)) delete upserts[k]; });

describe('POST /api/pipeline/day0', () => {
  it('rescores, selects Day-0 targets, predicts, and builds manifests (no routing)', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline/day0', {
      method: 'POST', body: JSON.stringify({ categoryOrdinal: 4 }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.predictions).toBe(1);
    expect(body.manifests).toBe(1);

    // Uses the report-independent target selector, never the report-gated one.
    expect(calls).toContain('rpc:pipeline_targets_day0');
    expect(calls).not.toContain('rpc:pipeline_targets');
    // rescore runs before target selection.
    expect(calls.indexOf('rpc:silent_area_score')).toBeLessThan(calls.indexOf('rpc:pipeline_targets_day0'));
    // Day-0 is prediction + Sphere only — no routing/dispatch.
    expect(calls).not.toContain('rpc:pipeline_cost_matrix');
    expect(calls).not.toContain('rpc:pipeline_save_route');
  });

  it('marks predictions as Day-0 and omits override_value so coordinator overrides survive', async () => {
    const { POST } = await import('./route');
    await POST(new Request('http://x/api/pipeline/day0', {
      method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
    }));
    const rows = upserts['impact_predictions'];
    expect(rows).toHaveLength(1);
    expect(rows[0].is_day0).toBe(true);
    expect(rows[0]).not.toHaveProperty('override_value');
  });

  it('defaults the storm scenario to category 4 when none is supplied', async () => {
    const predictImpact = vi.fn(async () => ({
      predictions: [{ affected: 1, affected_confidence: 0.5, confidence: 0.5, source: 'heuristic', id: 'b1' }],
      model_framing: 'regressor', latency_ms: 1 }));
    vi.doMock('@/lib/ai/impact', () => ({ predictImpact }));
    vi.resetModules();
    const { POST } = await import('./route');
    await POST(new Request('http://x/api/pipeline/day0', { method: 'POST', body: '{}' }));
    expect(predictImpact).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ category_ordinal: 4 })]),
    );
    vi.doUnmock('@/lib/ai/impact');
    vi.resetModules();
  });
});
