import { describe, expect, it } from 'vitest';
import { distanceMeters, shouldPublish, type Fix } from './position';

const base: Fix = { lat: 10.3157, lng: 123.8854, t: 1_000_000 };

describe('distanceMeters', () => {
  it('measures ~111m per 0.001° of latitude', () => {
    const d = distanceMeters(10.3157, 123.8854, 10.3167, 123.8854);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });
});

describe('shouldPublish', () => {
  it('always publishes the first fix', () => {
    expect(shouldPublish(null, base)).toBe(true);
  });

  it('suppresses updates inside the 5s window', () => {
    const next: Fix = { lat: 10.99, lng: 123.99, t: base.t + 3_000 };
    expect(shouldPublish(base, next)).toBe(false);
  });

  it('publishes after 5s when moved at least 15m', () => {
    const next: Fix = { lat: base.lat + 0.0002, lng: base.lng, t: base.t + 6_000 }; // ~22m
    expect(shouldPublish(base, next)).toBe(true);
  });

  it('suppresses a stationary fix until the 60s heartbeat', () => {
    const still: Fix = { lat: base.lat, lng: base.lng, t: base.t + 30_000 };
    expect(shouldPublish(base, still)).toBe(false);
    const heartbeat: Fix = { lat: base.lat, lng: base.lng, t: base.t + 61_000 };
    expect(shouldPublish(base, heartbeat)).toBe(true);
  });
});
