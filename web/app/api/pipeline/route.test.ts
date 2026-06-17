import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth/admin clients and the AI wrappers so we test orchestration, not I/O.
const calls: string[] = [];
const rpc = vi.fn(async (fn: string) => {
  calls.push(`rpc:${fn}`);
  if (fn === 'pipeline_targets') return { data: [{
    barangay_id: 'b1', name: 'Lahug', province: 'Cebu', population: 25000, lat: 10.33, lng: 123.9,
    score: 0.7, province_housing_units: 1058512, province_households: 1077180,
    structural_vuln_frac: 0.395, unimproved_water_frac: 0.0779 }], error: null };
  if (fn === 'pipeline_cost_matrix') return { data: { vids: [10, 20], seconds: [[0, 300], [300, 0]] }, error: null };
  if (fn === 'pipeline_save_route') return { data: 'route-1', error: null };
  if (fn === 'silent_area_score') return { data: 1, error: null };
  return { data: null, error: null };
});

let mockOverrideValue: number | null = null;

const upsert = vi.fn(async () => { calls.push('upsert'); return { error: null }; });
const fromFn = vi.fn((table: string) => ({ upsert, delete: () => ({ eq: async () => ({ error: null }) }),
  select: () => ({
    eq: () => ({ maybeSingle: async () => ({ data: { latitude: 10.31, longitude: 123.89 }, error: null }) }),
    in: async () => {
      if (table === 'impact_predictions' && mockOverrideValue !== null) {
        return { data: [{ barangay_id: 'b1', override_value: mockOverrideValue }], error: null };
      }
      return { data: [], error: null };
    },
    not: async () => ({ data: [{ id: 't1', capacity_kg: 5000 }], error: null })
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
vi.mock('@/lib/ai/supply', () => ({ buildManifest: async (req: any) => {
  calls.push(`buildManifest:${req.predicted_affected}`);
  return {
    predicted_affected: req.predicted_affected, days: 3, access_modifier: 1, households: 100,
    lines: [{ item: 'Drinking water', category: 'water', unit: 'L', quantity: 22500, unit_weight_kg: 1, weight_kg: 22500, basis: '', inputs: {} }],
    total_weight_kg: 22500, standards: {}
  };
} }));
vi.mock('@/lib/ai/routing', () => ({ optimizeRoutes: async () => ({
  routes: [{ vehicle_id: 't1', stops: [{ seq: 1, stop_id: 'b1', arrival_seconds: 300, travel_seconds: 300, demand_kg: 22500, cumulative_load_kg: 22500 }],
             total_travel_seconds: 600, finish_seconds: 600, total_cargo_kg: 22500, capacity_kg: 5000 }],
  dropped_stop_ids: [], served_count: 1, dropped_count: 0, total_travel_seconds: 600, solver_status: 'SUCCESS', latency_ms: 5 }) }));

beforeEach(() => {
  calls.length = 0;
  mockOverrideValue = null;
});

describe('POST /api/pipeline', () => {
  it('runs rescore -> predict -> manifest -> route in order and returns a summary', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline?', {
      method: 'POST', body: JSON.stringify({ barangayId: 'b1', categoryOrdinal: 4 }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.predictions).toBe(1);
    expect(body.routes).toBe(1);
    // rescore must run before targets are selected
    expect(calls.indexOf('rpc:silent_area_score')).toBeLessThan(calls.indexOf('rpc:pipeline_targets'));
    expect(calls).toContain('rpc:pipeline_save_route');
    expect(calls).toContain('buildManifest:7500'); // defaults to TabPFN prediction (damage_rate 0.3 * population 25000)
  });

  it('uses overridden impact value and propagates it to manifest and route', async () => {
    mockOverrideValue = 999;
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline?', {
      method: 'POST', body: JSON.stringify({ barangayId: 'b1', categoryOrdinal: 4 }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.predictions).toBe(1);
    expect(body.routes).toBe(1);
    expect(calls).toContain('buildManifest:999'); // uses the override!
  });
});
