import { describe, it, expect, vi, afterEach } from 'vitest';
import { optimizeRoutes } from './routing';

afterEach(() => vi.restoreAllMocks());

it('POSTs to /optimize-routes and returns routes', async () => {
  process.env.AI_SERVICE_URL = 'http://ai.test';
  vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    routes: [{ vehicle_id: 't1', stops: [], total_travel_seconds: 0, finish_seconds: 0,
               total_cargo_kg: 0, capacity_kg: 1500 }],
    dropped_stop_ids: [], served_count: 0, dropped_count: 0,
    total_travel_seconds: 0, solver_status: 'SUCCESS', latency_ms: 5,
  }), { status: 200 }));
  const out = await optimizeRoutes({
    stops: [{ id: 'depot' }, { id: 'b1', demand_kg: 100 }],
    cost_matrix: [[0, 100], [100, 0]],
    vehicles: [{ id: 't1', capacity_kg: 1500 }],
  });
  expect(out.solver_status).toBe('SUCCESS');
});
