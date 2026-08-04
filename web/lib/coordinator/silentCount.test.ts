import { describe, it, expect } from 'vitest';
import { countSilentOver } from './silentCount';

describe('countSilentOver', () => {
  it('counts barangays past the threshold', () => {
    expect(countSilentOver([{ hoursSinceContact: 25 }, { hoursSinceContact: 100 }], 24)).toBe(2);
  });

  it('counts never-contacted barangays as silent', () => {
    expect(countSilentOver([{ hoursSinceContact: null }], 24)).toBe(1);
  });

  it('excludes recent contact and the threshold itself', () => {
    expect(countSilentOver([{ hoursSinceContact: 24 }, { hoursSinceContact: 0 }], 24)).toBe(0);
  });

  it('is zero for an empty set', () => {
    expect(countSilentOver([], 24)).toBe(0);
  });
});
