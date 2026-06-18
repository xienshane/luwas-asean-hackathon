import { describe, expect, it } from 'vitest';
import type { ImpactPrediction } from '@/lib/types/coordinator';
import { isWideInterval, lowConfidenceReason } from './confidence';

const base: ImpactPrediction = {
  barangayId: 'b1',
  model: 'TabPFN v2',
  predictedAffected: 1000,
  affectedLow: 820,
  affectedHigh: 1740,
  damageSeverity: 'moderate',
  confidence: 'high',
  overrideValue: null,
  contributors: [],
  isDay0: false,
};

describe('isWideInterval', () => {
  it('is false when the 80% spread is within the point estimate', () => {
    expect(isWideInterval(base)).toBe(false); // spread 920 < 1000
  });
  it('is true when the spread exceeds the point estimate', () => {
    expect(isWideInterval({ ...base, affectedLow: 100, affectedHigh: 1700 })).toBe(true); // 1600 > 1000
  });
  it('is false when there is no interval (heuristic path)', () => {
    expect(isWideInterval({ ...base, affectedLow: null, affectedHigh: null })).toBe(false);
  });
});

describe('lowConfidenceReason', () => {
  it('returns null for a confident, narrow-interval TabPFN prediction', () => {
    expect(lowConfidenceReason(base)).toBeNull();
  });
  it('returns null for missing prediction', () => {
    expect(lowConfidenceReason(undefined)).toBeNull();
  });
  it('flags the heuristic fallback first (highest precedence)', () => {
    const r = lowConfidenceReason({ ...base, model: 'Heuristic', affectedLow: null, affectedHigh: null });
    expect(r).toMatch(/heuristic/i);
  });
  it('flags a wide interval over low model confidence', () => {
    const r = lowConfidenceReason({ ...base, confidence: 'low', affectedLow: 100, affectedHigh: 1700 });
    expect(r).toMatch(/wide/i);
  });
  it('flags low model confidence when interval is narrow and model is not heuristic', () => {
    const r = lowConfidenceReason({ ...base, confidence: 'low' });
    expect(r).toMatch(/low model confidence/i);
  });
});
