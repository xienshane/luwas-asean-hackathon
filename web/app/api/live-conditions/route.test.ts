import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { REGIONS } from '@/lib/regions';

// Signed-in coordinator for all functional tests (authz covered separately).
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'coord-1' } } }) },
    rpc: async () => ({ data: true, error: null }), // is_coordinator
  }),
}));

const cur = (wind_speed_10m: number) => ({
  current: { time: 't', wind_speed_10m, wind_gusts_10m: wind_speed_10m + 30, precipitation: 1 },
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const req = (region?: string) =>
  new Request(`http://localhost/api/live-conditions${region ? `?region=${region}` : ''}`);

beforeEach(() => { vi.resetModules(); }); // clears the route's in-memory cache between tests
afterEach(() => { vi.unstubAllGlobals(); delete process.env.LIVE_CONDITIONS_TTL_SECONDS; });

describe('GET /api/live-conditions', () => {
  it('samples the Cebu region and derives the PAGASA category ordinal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({
      current: { time: '2026-06-17T01:00', wind_speed_10m: 120, wind_gusts_10m: 150, precipitation: 12.5 },
    })));
    const { GET } = await import('./route');
    const body = await (await GET(req())).json();
    expect(body.available).toBe(true);
    expect(body.conditions.wind_kmh).toBe(120);
    expect(body.conditions.category_ordinal).toBe(3); // 118–156 -> strong typhoon
    expect(body.conditions.category_label).toBe('Typhoon');
    expect(body.conditions.stale).toBe(false);
  });

  it('takes the WORST (max wind) across the sampled points', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(cur(60)))
      .mockResolvedValueOnce(ok(cur(160)))  // worst point
      .mockResolvedValueOnce(ok(cur(90)));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    const body = await (await GET(req())).json();
    expect(body.conditions.wind_kmh).toBe(160);
    expect(body.conditions.category_ordinal).toBe(4); // 157–193 -> very strong typhoon
    expect(body.conditions.category_label).toBe('Super Typhoon');
  });

  it('tolerates a failed point and uses the worst of those that responded', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(cur(70)))
      .mockRejectedValueOnce(new Error('one point down'))
      .mockResolvedValueOnce(ok(cur(130)));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    const body = await (await GET(req())).json();
    expect(body.available).toBe(true);
    expect(body.conditions.wind_kmh).toBe(130);
    expect(body.conditions.category_ordinal).toBe(3);
  });

  it('serves the cached reading without re-fetching inside the TTL', async () => {
    const fetchMock = vi.fn(async () => ok(cur(70)));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    await GET(req());
    await GET(req());
    // One fetch per sampled point on the first call; the second call hits the cache.
    expect(fetchMock).toHaveBeenCalledTimes(REGIONS.cebu.samplePoints.length);
  });

  it('serves last-good flagged stale when a refresh fails', async () => {
    process.env.LIVE_CONDITIONS_TTL_SECONDS = '0'; // force a refresh on every call
    let fail = false;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (fail) throw new Error('network down');
      return ok(cur(70));
    }));
    const { GET } = await import('./route');
    const first = await (await GET(req())).json();
    expect(first.conditions.category_ordinal).toBe(1); // 70 km/h -> tropical storm
    fail = true;
    const second = await (await GET(req())).json();
    expect(second.available).toBe(true);
    expect(second.conditions.stale).toBe(true);
    expect(second.conditions.wind_kmh).toBe(70); // last-good value
  });

  it('samples the requested region rather than the default', async () => {
    // Typed so `mock.calls` keeps the URL argument this test asserts on.
    const fetchMock = vi.fn<(url: string) => Promise<ReturnType<typeof ok>>>(
      async () => ok(cur(70)),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    await GET(req('danang'));
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(REGIONS.danang.samplePoints.length);
    // Every sampled point must be Vietnamese, not Philippine.
    for (const p of REGIONS.danang.samplePoints) {
      expect(urls.some((u) => u.includes(`latitude=${p.lat}`))).toBe(true);
    }
    expect(urls.some((u) => u.includes('latitude=10.3157'))).toBe(false); // no Cebu City
  });

  it('caches per region, so one pack cannot serve the other its weather', async () => {
    const fetchMock = vi.fn(async () => ok(cur(70)));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    await GET(req('cebu'));
    const afterCebu = fetchMock.mock.calls.length;
    await GET(req('danang')); // different region: must miss the cache
    expect(fetchMock.mock.calls.length)
      .toBe(afterCebu + REGIONS.danang.samplePoints.length);
  });

  it('falls back to the default region when the query string is not a known pack', async () => {
    const fetchMock = vi.fn(async () => ok(cur(70)));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('./route');
    const res = await GET(req('atlantis'));
    expect((await res.json()).available).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(REGIONS.cebu.samplePoints.length);
  });

  it('reports unavailable (HTTP 200, no throw) when every point fails with an empty cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const { GET } = await import('./route');
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.available).toBe(false);
  });
});
