import { it, expect, vi, afterEach } from 'vitest';

const req = () => new Request('http://localhost/api/live-conditions');

afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); });

it('rejects an unauthenticated caller with 401', async () => {
  vi.stubGlobal('fetch', vi.fn()); // must never be called
  vi.doMock('@/lib/supabase/server', () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: null } }) },
      rpc: async () => ({ data: false, error: null }),
    }),
  }));
  const { GET } = await import('./route');
  const res = await GET(req());
  expect(res.status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects a non-coordinator with 403', async () => {
  vi.stubGlobal('fetch', vi.fn());
  vi.doMock('@/lib/supabase/server', () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'vol-1' } } }) },
      rpc: async () => ({ data: false, error: null }), // is_coordinator -> false
    }),
  }));
  const { GET } = await import('./route');
  const res = await GET(req());
  expect(res.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
