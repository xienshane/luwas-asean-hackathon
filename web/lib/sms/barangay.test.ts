import { describe, expect, it } from 'vitest';
import { normalizeBarangayQuery } from './barangay';

describe('normalizeBarangayQuery', () => {
  it('strips brgy/barangay prefixes and trims', () => {
    expect(normalizeBarangayQuery('Brgy. Pasil')).toBe('pasil');
    expect(normalizeBarangayQuery('barangay Lahug')).toBe('lahug');
  });

  it('drops a trailing city qualifier after a comma', () => {
    expect(normalizeBarangayQuery('Guadalupe, Cebu City')).toBe('guadalupe');
  });

  it('returns empty string for nothing useful', () => {
    expect(normalizeBarangayQuery('  ')).toBe('');
    expect(normalizeBarangayQuery(null)).toBe('');
  });
});
