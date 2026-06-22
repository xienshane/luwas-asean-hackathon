import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the service-role RPC so we can assert the block/restore call + attribution.
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  rpcCalls.push({ fn, args });
  if (fn === 'nearest_road_edge_at') return { data: 99, error: null };
  return { data: null, error: null };
});

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'coord-1' } } }) },
  rpc: async () => ({ data: true, error: null }), // is_coordinator
}) }));

beforeEach(() => { rpcCalls.length = 0; });

const post = async (body: unknown) => {
  const { POST } = await import('./route');
  return POST(new Request('http://x/api/road-status', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
};

describe('POST /api/road-status', () => {
  it('blocks an edge attributed to the coordinator', async () => {
    const res = await post({ edgeId: 42, impassable: true, reason: 'bridge out' });
    expect(res.status).toBe(200);
    const call = rpcCalls.find((c) => c.fn === 'set_edge_impassable');
    expect(call).toBeTruthy();
    expect(call!.args.p_edge_id).toBe(42);
    expect(call!.args.p_impassable).toBe(true);
    expect(call!.args.p_actor).toBe('coord-1');
    expect(call!.args.p_reason).toBe('bridge out');
  });

  it('restores an edge when impassable is false', async () => {
    const res = await post({ edgeId: 42, impassable: false });
    expect(res.status).toBe(200);
    const call = rpcCalls.find((c) => c.fn === 'set_edge_impassable');
    expect(call!.args.p_impassable).toBe(false);
  });

  it('snaps a clicked {lat,lng} to the nearest edge and blocks it', async () => {
    const res = await post({ lat: 10.33, lng: 123.905, impassable: true });
    expect(res.status).toBe(200);
    const snap = rpcCalls.find((c) => c.fn === 'nearest_road_edge_at');
    expect(snap!.args).toEqual({ p_lat: 10.33, p_lng: 123.905 });
    const block = rpcCalls.find((c) => c.fn === 'set_edge_impassable');
    expect(block!.args.p_edge_id).toBe(99);
    expect(block!.args.p_impassable).toBe(true);
    expect(block!.args.p_actor).toBe('coord-1');
  });

  it('rejects when neither edgeId nor lat/lng is provided with 400', async () => {
    const res = await post({ impassable: true });
    expect(res.status).toBe(400);
    expect(rpcCalls.find((c) => c.fn === 'set_edge_impassable')).toBeUndefined();
  });
});
