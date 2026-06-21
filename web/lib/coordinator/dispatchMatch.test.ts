import { describe, expect, it } from 'vitest';
import type { Team, Barangay } from '@/lib/types/coordinator';
import { haversineKm, estDistanceKm, capacityFit, recommendTeam } from './dispatchMatch';

const team = (id: string, lat: number, lng: number, capacityKg: number, status: Team['status'] = 'idle'): Team => ({
  id, name: id, capacityKg, baseLocation: { lat, lng }, status, type: 'truck',
});

const barangay = (lat: number, lng: number): Pick<Barangay, 'latitude' | 'longitude'> => ({ latitude: lat, longitude: lng });

describe('haversineKm', () => {
  it('is ~0 for identical points', () => {
    expect(haversineKm({ lat: 10.3, lng: 123.9 }, { lat: 10.3, lng: 123.9 })).toBeCloseTo(0, 6);
  });

  it('matches a known Cebu distance (Cebu City ↔ Mandaue ≈ 5–7 km)', () => {
    const d = haversineKm({ lat: 10.3157, lng: 123.8854 }, { lat: 10.3236, lng: 123.9223 });
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(7);
  });

  it('≈111 km per degree of latitude', () => {
    expect(haversineKm({ lat: 10, lng: 123 }, { lat: 11, lng: 123 })).toBeCloseTo(111.2, 0);
  });
});

describe('estDistanceKm', () => {
  it('measures from team base to barangay centroid', () => {
    expect(estDistanceKm(team('a', 10.3, 123.9, 1000), barangay(10.3, 123.9))).toBeCloseTo(0, 6);
  });
});

describe('capacityFit', () => {
  it('fits when capacity covers the load', () => {
    expect(capacityFit(team('a', 0, 0, 1000), 800)).toBe('fits');
  });
  it('tight when within 20% short', () => {
    expect(capacityFit(team('a', 0, 0, 850), 1000)).toBe('tight');
  });
  it('short when far below the load', () => {
    expect(capacityFit(team('a', 0, 0, 500), 1000)).toBe('short');
  });
  it('treats unknown/zero weight as fits (no signal)', () => {
    expect(capacityFit(team('a', 0, 0, 100), 0)).toBe('fits');
  });
});

describe('recommendTeam', () => {
  const dest = barangay(10.3, 123.9);

  it('prefers the nearest team that fits over a nearer team that does not', () => {
    const near = team('near', 10.301, 123.9, 200); // closest but can't carry 1000kg
    const far = team('far', 10.32, 123.9, 2000);   // farther but fits
    expect(recommendTeam([near, far], dest, 1000)?.id).toBe('far');
  });

  it('returns null when no dispatchable team can fit', () => {
    expect(recommendTeam([team('a', 10.3, 123.9, 100)], dest, 1000)).toBeNull();
  });

  it('ignores non-dispatchable teams', () => {
    const busy = team('busy', 10.3, 123.9, 5000, 'maintenance');
    const ok = team('ok', 10.5, 123.9, 5000, 'idle');
    expect(recommendTeam([busy, ok], dest, 1000)?.id).toBe('ok');
  });

  it('is deterministic on a distance tie (lower id wins)', () => {
    const a = team('a', 10.31, 123.9, 2000);
    const b = team('b', 10.29, 123.9, 2000); // same |Δlat|, equal distance
    expect(recommendTeam([b, a], dest, 1000)?.id).toBe('a');
  });
});
