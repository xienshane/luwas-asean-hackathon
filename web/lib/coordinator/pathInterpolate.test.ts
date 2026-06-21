import { describe, expect, it } from 'vitest';
import type { LngLat } from './routeGeometry';
import { pathLength, pointAtFraction, stopFraction } from './pathInterpolate';

// Due-east straight line at the equator-ish (lat constant so cos correction is uniform).
const east: LngLat[] = [[123.9, 10.3], [124.0, 10.3]];
// Due-north straight line.
const north: LngLat[] = [[123.9, 10.3], [123.9, 10.4]];

describe('pathLength', () => {
  it('accumulates segment lengths with cum[0] = 0', () => {
    const { cum, total } = pathLength(east);
    expect(cum[0]).toBe(0);
    expect(cum).toHaveLength(2);
    expect(total).toBeGreaterThan(0);
    expect(cum[1]).toBeCloseTo(total, 10);
  });
});

describe('pointAtFraction', () => {
  it('returns exact endpoints on a 2-point line at f=0 and f=1', () => {
    expect(pointAtFraction(east, 0)).toMatchObject({ lng: 123.9, lat: 10.3 });
    const end = pointAtFraction(east, 1);
    expect(end.lng).toBeCloseTo(124.0, 10);
    expect(end.lat).toBeCloseTo(10.3, 10);
  });

  it('returns the midpoint at f=0.5 on a 2-point line', () => {
    const mid = pointAtFraction(east, 0.5);
    expect(mid.lng).toBeCloseTo(123.95, 10);
    expect(mid.lat).toBeCloseTo(10.3, 10);
  });

  it('lands in the far segment of a multi-segment line', () => {
    // Three equal-ish eastward hops; f=0.8 should be inside the last segment.
    const line: LngLat[] = [[123.9, 10.3], [124.0, 10.3], [124.1, 10.3], [124.2, 10.3]];
    const p = pointAtFraction(line, 0.8);
    expect(p.lng).toBeGreaterThan(124.1);
    expect(p.lng).toBeLessThan(124.2);
  });

  it('reports ~90° bearing for due-east and ~0° for due-north', () => {
    expect(pointAtFraction(east, 0.5).bearing).toBeCloseTo(90, 1);
    expect(pointAtFraction(north, 0.5).bearing).toBeCloseTo(0, 1);
  });

  it('clamps f below 0 and above 1', () => {
    expect(pointAtFraction(east, -5)).toMatchObject({ lng: 123.9, lat: 10.3 });
    const over = pointAtFraction(east, 5);
    expect(over.lng).toBeCloseTo(124.0, 10);
  });

  it('handles degenerate paths (single point / empty / zero-length)', () => {
    expect(pointAtFraction([[123.9, 10.3]], 0.5)).toEqual({ lng: 123.9, lat: 10.3, bearing: 0 });
    expect(pointAtFraction([], 0.5)).toEqual({ lng: 0, lat: 0, bearing: 0 });
    expect(pointAtFraction([[123.9, 10.3], [123.9, 10.3]], 0.5)).toMatchObject({ lng: 123.9, lat: 10.3 });
  });
});

describe('stopFraction', () => {
  it('is deterministic for a given id', () => {
    expect(stopFraction('route-abc')).toBe(stopFraction('route-abc'));
  });

  it('stays within [base-spread, base+spread]', () => {
    for (const id of ['a', 'route-1', 'team-xyz-99', '', 'long-id-' + 'x'.repeat(40)]) {
      const f = stopFraction(id, 0.6, 0.08);
      expect(f).toBeGreaterThanOrEqual(0.6 - 0.08);
      expect(f).toBeLessThanOrEqual(0.6 + 0.08);
    }
  });

  it('produces different fractions for different ids (staggering)', () => {
    expect(stopFraction('route-1')).not.toBe(stopFraction('route-2'));
  });
});
