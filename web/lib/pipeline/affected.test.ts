import { describe, expect, it } from 'vitest';
import { pickAffected, affectedSource } from './affected';

describe('pickAffected', () => {
  it('prefers the coordinator override above all', () => {
    expect(pickAffected({ override: 500, reported: 1200, predicted: 900 })).toBe(500);
  });
  it('prefers a confirmed report over the model prediction', () => {
    expect(pickAffected({ override: null, reported: 1200, predicted: 900 })).toBe(1200);
  });
  it('falls back to the prediction when neither override nor report exists', () => {
    expect(pickAffected({ override: null, reported: null, predicted: 900 })).toBe(900);
  });
  it('returns 0 when nothing is known', () => {
    expect(pickAffected({})).toBe(0);
  });
  it('treats 0 as a real value, not absent', () => {
    expect(pickAffected({ override: 0, reported: 1200, predicted: 900 })).toBe(0);
  });
});

describe('affectedSource', () => {
  it('labels the winning source for the UI', () => {
    expect(affectedSource({ override: 5 })).toBe('override');
    expect(affectedSource({ reported: 5 })).toBe('reported');
    expect(affectedSource({ predicted: 5 })).toBe('predicted');
    expect(affectedSource({})).toBe('none');
  });
});
