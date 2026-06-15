import { describe, it, expect } from 'vitest';
import { toFeatures, severityFromDamageRate, AVG_HOUSEHOLD_SIZE, type TargetRow } from './features';

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
