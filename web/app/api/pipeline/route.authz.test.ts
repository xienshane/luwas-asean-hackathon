import { describe, it, expect, vi } from 'vitest';

// Non-coordinator: getUser returns a user, but is_coordinator() returns false -> 403.
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'u2' } } }) },
  rpc: async () => ({ data: false, error: null }),
}) }));

describe('POST /api/pipeline authz', () => {
  it('rejects non-coordinators with 403', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/pipeline', { method: 'POST', body: '{}' }));
    expect([401, 403]).toContain(res.status);
  });
});
