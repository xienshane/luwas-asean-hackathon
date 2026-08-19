import { describe, it, expect } from 'vitest';
import { REGIONS, REGION_LIST, DEFAULT_REGION, isRegionId } from './regions';

// These are the invariants a new country pack has to satisfy. They are deliberately
// generic — every check runs over REGION_LIST rather than naming Cebu or Đà Nẵng — so
// adding a third pack is caught by the same suite instead of needing new tests.
describe('country packs', () => {
  it('keys every entry by its own id', () => {
    for (const [key, region] of Object.entries(REGIONS)) {
      expect(region.id).toBe(key);
    }
  });

  it('has a default that exists', () => {
    expect(REGIONS[DEFAULT_REGION]).toBeDefined();
  });

  it.each(REGION_LIST.map((r) => [r.id, r] as const))(
    '%s: bounds are well-formed (south-west corner before north-east)',
    (_id, region) => {
      const [[west, south], [east, north]] = region.bounds;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
    },
  );

  it.each(REGION_LIST.map((r) => [r.id, r] as const))(
    '%s: home view sits inside its own bounds',
    (_id, region) => {
      const [[west, south], [east, north]] = region.bounds;
      const [lng, lat] = region.center;
      expect(lng).toBeGreaterThanOrEqual(west);
      expect(lng).toBeLessThanOrEqual(east);
      expect(lat).toBeGreaterThanOrEqual(south);
      expect(lat).toBeLessThanOrEqual(north);
    },
  );

  // The map hard-clamps panning to `bounds`, so a sample point outside them is weather
  // read from somewhere the coordinator cannot even look at.
  it.each(REGION_LIST.map((r) => [r.id, r] as const))(
    '%s: every live-conditions sample point falls inside its bounds',
    (_id, region) => {
      const [[west, south], [east, north]] = region.bounds;
      expect(region.samplePoints.length).toBeGreaterThanOrEqual(3);
      for (const p of region.samplePoints) {
        expect(p.lng, `${p.name} longitude`).toBeGreaterThanOrEqual(west);
        expect(p.lng, `${p.name} longitude`).toBeLessThanOrEqual(east);
        expect(p.lat, `${p.name} latitude`).toBeGreaterThanOrEqual(south);
        expect(p.lat, `${p.name} latitude`).toBeLessThanOrEqual(north);
      }
    },
  );

  // Two packs sampling the same coordinates would mean one is reading the other's
  // weather — the exact failure the per-region cache key exists to prevent.
  it('never samples the same coordinate in two regions', () => {
    const seen = new Map<string, string>();
    for (const region of REGION_LIST) {
      for (const p of region.samplePoints) {
        const key = `${p.lat},${p.lng}`;
        expect(seen.get(key), `${key} shared with ${seen.get(key)}`).toBeUndefined();
        seen.set(key, region.id);
      }
    }
  });

  it('recognises exactly the known pack ids', () => {
    for (const region of REGION_LIST) expect(isRegionId(region.id)).toBe(true);
    expect(isRegionId('atlantis')).toBe(false);
    expect(isRegionId('')).toBe(false);
  });
});
