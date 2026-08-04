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
  if (fn === 'pipeline_save_route') {
    return mockSaveRouteError ? { data: null, error: mockSaveRouteError } : { data: 'route-1', error: null };
  }
  if (fn === 'silent_area_score') return { data: 1, error: null };
  return { data: null, error: null };
});

let mockOverrideValue: number | null = null;
let mockSaveRouteError: { message: string } | null = null;
let mockStoredManifests: Record<string, unknown>[] = [];
let mockConfirmedReports: { barangay_id: string; population_estimate: number; created_at: string }[] = [];

const upsertsByTable: Record<string, Record<string, unknown>[]> = {};

const upsert = vi.fn(async () => { calls.push('upsert'); return { error: null }; });
const fromFn = vi.fn((table: string) => ({
  upsert: (rows: Record<string, unknown>[]) => { upsertsByTable[table] = rows; return upsert(); },
  delete: () => ({ eq: async () => ({ error: null }) }),
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({ data: { latitude: 10.31, longitude: 123.89 }, error: null }),
      // field_reports confirmed-affected lookup: .eq('status','confirmed').in(...).order(...)
      in: () => ({ order: async () => ({ data: mockConfirmedReports, error: null }) }),
    }),
    in: async () => {
      if (table === 'impact_predictions' && mockOverrideValue !== null) {
        return { data: [{ barangay_id: 'b1', override_value: mockOverrideValue }], error: null };
      }
      if (table === 'supply_manifests') return { data: mockStoredManifests, error: null };
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
vi.mock('@/lib/ai/supply', () => ({ buildManifest: async (req: { predicted_affected: number }) => {
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
  mockSaveRouteError = null;
  mockStoredManifests = [];
  mockConfirmedReports = [];
  for (const k of Object.keys(upsertsByTable)) delete upsertsByTable[k];
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

  it('uses the latest confirmed report affected over the model prediction', async () => {
    mockConfirmedReports = [{ barangay_id: 'b1', population_estimate: 1234, created_at: '2026-06-18T00:00:00Z' }];
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline?', {
      method: 'POST', body: JSON.stringify({ barangayId: 'b1', categoryOrdinal: 4 }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    expect(calls).toContain('buildManifest:1234'); // reported affected outranks the 7500 prediction
  });

  it('lets a coordinator override outrank even a confirmed report', async () => {
    mockOverrideValue = 999;
    mockConfirmedReports = [{ barangay_id: 'b1', population_estimate: 1234, created_at: '2026-06-18T00:00:00Z' }];
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline?', {
      method: 'POST', body: JSON.stringify({ barangayId: 'b1', categoryOrdinal: 4 }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    expect(calls).toContain('buildManifest:999'); // override beats report
  });

  it('clears is_day0 so an anticipatory chip cannot survive a report-driven run', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline?', {
      method: 'POST', body: JSON.stringify({ barangayId: 'b1', categoryOrdinal: 4 }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    expect(upsertsByTable['impact_predictions'][0].is_day0).toBe(false);
  });

  it('returns 500 naming the cause when no route persisted', async () => {
    mockSaveRouteError = { message: 'permission denied for table routes' };
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline?', {
      method: 'POST', body: JSON.stringify({ barangayId: 'b1' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('permission denied for table routes');
    expect(body.predictions).toBe(1); // the stages that did land are still reported
  });

  it('reroute mode skips rescore, prediction and manifest building', async () => {
    mockStoredManifests = [{
      barangay_id: 'b1', water_l: 22500, food_packs: 0, shelter_kits: 0, blankets: 0,
      breakdown: { total_weight_kg: 22500 }, overridden: false, days: 3, access_modifier: 1,
    }];
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline?', {
      method: 'POST', body: JSON.stringify({ mode: 'reroute' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('reroute');
    expect(body.rescored).toBe(false);
    expect(body.predictions).toBe(0);
    expect(body.routes).toBe(1);
    expect(calls).not.toContain('rpc:silent_area_score');
    expect(calls.some((c) => c.startsWith('buildManifest:'))).toBe(false);
    expect(calls).toContain('rpc:pipeline_save_route');
  });

  it('reroute mode reports when there is nothing persisted to reroute', async () => {
    mockStoredManifests = [];
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline?', {
      method: 'POST', body: JSON.stringify({ mode: 'reroute' }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routes).toBe(0);
    expect(body.note).toMatch(/full pipeline/i);
  });
});
