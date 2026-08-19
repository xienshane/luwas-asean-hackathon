import { describe, it, expect, vi, beforeEach } from 'vitest';
import { teamRowToUi, roadStatusRowToEdge, facilityRowToHub } from './coordinator';

// Records the filter chain each query builds, so the tests below can assert on scoping
// rather than on a live database.
const queries: Array<{ table: string; eq: Record<string, unknown>; or: string[] }> = [];

vi.mock('./client', () => ({
  createClient: () => ({
    from(table: string) {
      const q = { table, eq: {} as Record<string, unknown>, or: [] as string[] };
      queries.push(q);
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => { q.eq[col] = val; return builder; },
        or: (expr: string) => { q.or.push(expr); return builder; },
        then: (resolve: (v: unknown) => void) => resolve({ count: 0, error: null }),
      };
      return builder;
    },
  }),
}));

it('maps a coordinator_teams row to the UI Team', () => {
  const t = teamRowToUi({ id: 't1', name: 'Truck 1', capacity_kg: 5000, status: 'idle', type: 'truck', base_lat: 10.3, base_lng: 123.9 });
  expect(t).toMatchObject({ id: 't1', name: 'Truck 1', capacityKg: 5000, type: 'truck', baseLocation: { lat: 10.3, lng: 123.9 } });
});

it('maps a road-status row (GeoJSON line) to a RoadEdge with endpoints', () => {
  const e = roadStatusRowToEdge({ id: 5, name: 'X St', length_m: 100, impassable: true,
    geometry: { type: 'LineString', coordinates: [[123.9, 10.3], [123.91, 10.31]] } });
  expect(e.status).toBe('blocked');
  expect(e.sourceCoords).toEqual({ lat: 10.3, lng: 123.9 });
  expect(e.targetCoords).toEqual({ lat: 10.31, lng: 123.91 });
});

it('maps a facility row to a LocationHub', () => {
  const h = facilityRowToHub({ id: 'd1', name: 'PDRRMO', kind: 'depot', is_depot: true, latitude: 10.31, longitude: 123.89 });
  expect(h).toMatchObject({ id: 'd1', name: 'PDRRMO', type: 'warehouse', latitude: 10.31, longitude: 123.89 });
});

// Regression: the queue counters were read from `field_reports`, which carries no region,
// so a map of Đà Nẵng was headed by Cebu's whole province-wide queue (347 awaiting, 41
// critical). They must read the region-scoped view instead.
describe('fetchReportCounts region scoping', () => {
  beforeEach(() => { queries.length = 0; });

  it('counts through the region-bearing view, never the bare table', async () => {
    const { fetchReportCounts } = await import('./coordinator');
    await fetchReportCounts('danang');
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(q.table).toBe('coordinator_field_reports');
      expect(q.eq.status).toBe('pending');
    }
    expect(queries[1].eq.needs_severity).toBe('critical');
  });

  it('scopes to the requested region and keeps unplaced reports visible', async () => {
    const { fetchReportCounts } = await import('./coordinator');
    await fetchReportCounts('danang');
    for (const q of queries) {
      // Unplaced reports (region null) belong to no pack and must count everywhere —
      // the same rule useLiveReports applies to the list these numbers head.
      expect(q.or).toEqual(['region.eq.danang,region.is.null']);
    }
  });

  it('defaults to the default pack when no region is given', async () => {
    const { fetchReportCounts } = await import('./coordinator');
    await fetchReportCounts();
    expect(queries[0].or[0]).toBe('region.eq.cebu,region.is.null');
  });
});
