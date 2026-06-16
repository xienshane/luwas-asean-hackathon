import { describe, it, expect } from 'vitest';
import { toFeatures, severityFromDamageRate, boundedAffected, AVG_HOUSEHOLD_SIZE, type TargetRow } from './features';

const row: TargetRow = {
  barangay_id: 'b1', name: 'Lahug', province: 'Cebu', population: 25000,
  lat: 10.33, lng: 123.9, score: 0.7,
  province_housing_units: 1058512, province_households: 1077180,
  structural_vuln_frac: 0.395, unimproved_water_frac: 0.0779,
};

it('derives total_houses from population / household size', () => {
  const f = toFeatures(row, 4);
  expect(f.total_houses).toBe(Math.round(25000 / AVG_HOUSEHOLD_SIZE));
  expect(f.category_ordinal).toBe(4);
  expect(f.province_housing_units).toBe(1058512);
  expect(f.id).toBe('b1');
});

it('maps damage_rate to a severity class (Sphere bins)', () => {
  expect(severityFromDamageRate(0.02)).toBe('low');
  expect(severityFromDamageRate(0.1)).toBe('moderate');
  expect(severityFromDamageRate(0.3)).toBe('high');
  expect(severityFromDamageRate(0.6)).toBe('severe');
  expect(severityFromDamageRate(null)).toBe('moderate'); // safe default
});

describe('boundedAffected', () => {
  it('derives affected from damage_rate * population (bounded by population)', () => {
    // 0.3 * 25000 = 7500 — well under population, so used directly.
    expect(boundedAffected({ affected: 999999, damage_rate: 0.3, severity_class: null }, 25000)).toBe(7500);
  });

  it('never exceeds the barangay population even when the rate is high', () => {
    expect(boundedAffected({ affected: 999999, damage_rate: 1.2, severity_class: null }, 25000)).toBe(25000);
  });

  it('falls back to severity-class midpoints when damage_rate is absent (classifier framing)', () => {
    // high -> 0.35 midpoint; 0.35 * 10000 = 3500.
    expect(boundedAffected({ affected: 999999, damage_rate: null, severity_class: 'high' }, 10000)).toBe(3500);
  });

  it('clamps the raw province-scale count when no severity signal exists at all', () => {
    expect(boundedAffected({ affected: 999999, damage_rate: null, severity_class: null }, 8000)).toBe(8000);
    expect(boundedAffected({ affected: 500, damage_rate: null, severity_class: null }, 8000)).toBe(500);
  });

  it('treats missing population as zero', () => {
    expect(boundedAffected({ affected: 500, damage_rate: 0.3, severity_class: null }, null)).toBe(0);
  });
});
