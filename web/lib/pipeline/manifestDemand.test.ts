import { describe, it, expect } from 'vitest';
import { manifestDemandKg } from './manifestDemand';

const base = { water_l: 100, food_packs: 10, shelter_kits: 2, blankets: 4 };

describe('manifestDemandKg', () => {
  it('uses the stored total weight when the breakdown has one', () => {
    expect(manifestDemandKg({ ...base, breakdown: { total_weight_kg: 48200 } })).toBe(48200);
  });

  it('sums the Sphere line weights when the breakdown has no total', () => {
    // 100*1.0 + 10*0.6 + 2*5.0 + 4*1.5 = 122
    expect(manifestDemandKg({ ...base, breakdown: null })).toBe(122);
  });

  it('treats null quantities as zero', () => {
    expect(manifestDemandKg({
      water_l: null, food_packs: null, shelter_kits: null, blankets: null, breakdown: null,
    })).toBe(0);
  });

  it('ignores a non-finite stored total', () => {
    expect(manifestDemandKg({ ...base, breakdown: { total_weight_kg: NaN } })).toBe(122);
  });
});
