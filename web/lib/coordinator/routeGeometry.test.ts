import { describe, expect, it } from 'vitest';
import { routeLineCoords } from './routeGeometry';

const path = [{ lat: 10.3, lng: 123.9 }, { lat: 10.31, lng: 123.91 }, { lat: 10.32, lng: 123.92 }];
const snapped: [number, number][] = [[123.9, 10.3], [123.95, 10.35]];

describe('routeLineCoords', () => {
  it('prefers the real pgRouting path (block-aware) over an OSRM snap', () => {
    expect(routeLineCoords({ path }, snapped)).toEqual([[123.9, 10.3], [123.91, 10.31], [123.92, 10.32]]);
  });
  it('falls back to the OSRM snap when the path is degenerate (<2 points)', () => {
    expect(routeLineCoords({ path: [{ lat: 10.3, lng: 123.9 }] }, snapped)).toEqual(snapped);
  });
  it('returns an empty line when neither is usable', () => {
    expect(routeLineCoords({ path: [] }, null)).toEqual([]);
  });
});
