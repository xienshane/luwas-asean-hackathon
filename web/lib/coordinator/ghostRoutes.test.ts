import { describe, expect, it } from 'vitest';
import { coordsChanged } from './ghostRoutes';

const a: [number, number][] = [[123.9, 10.3], [123.91, 10.31]];

describe('coordsChanged', () => {
  it('is false for identical paths', () => {
    expect(coordsChanged(a, [[123.9, 10.3], [123.91, 10.31]])).toBe(false);
  });
  it('is true when a coordinate moves', () => {
    expect(coordsChanged(a, [[123.9, 10.3], [123.92, 10.31]])).toBe(true);
  });
  it('is true when the length differs (a reroute is usually longer/shorter)', () => {
    expect(coordsChanged(a, [[123.9, 10.3], [123.91, 10.31], [123.92, 10.32]])).toBe(true);
  });
  it('is false when the previous path was empty (nothing to ghost)', () => {
    expect(coordsChanged([], a)).toBe(false);
  });
});
