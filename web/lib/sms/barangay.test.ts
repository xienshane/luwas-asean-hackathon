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

  // The Da Nang pack (S10). The gazetteer stores `name_normalized` folded the same way,
  // so every case here has to come out as plain lowercase ASCII or the lookup misses.
  describe('Vietnamese place names', () => {
    it('folds diacritics so an accented ward matches its romanized form', () => {
      expect(normalizeBarangayQuery('Phường An Hải')).toBe('an hai');
      expect(normalizeBarangayQuery('Ngũ Hành Sơn')).toBe('ngu hanh son');
      expect(normalizeBarangayQuery('Hòa Cường')).toBe('hoa cuong');
    });

    it('folds đ, which NFD leaves intact because it is its own letter', () => {
      expect(normalizeBarangayQuery('Đà Nẵng')).toBe('da nang');
    });

    it('strips the English admin noun a translating model appends', () => {
      // This exact string is what SEA-LION returns for the Vietnamese preset.
      expect(normalizeBarangayQuery('An Hai Ward, Da Nang')).toBe('an hai');
      expect(normalizeBarangayQuery('Hoa Cuong Commune')).toBe('hoa cuong');
    });

    it('strips phường and xã prefixes in either spelling', () => {
      expect(normalizeBarangayQuery('phường An Hải')).toBe('an hai');
      expect(normalizeBarangayQuery('Phuong An Hai')).toBe('an hai');
      expect(normalizeBarangayQuery('Xã Hòa Tiến')).toBe('hoa tien');
    });

    it('leaves Philippine names unchanged', () => {
      expect(normalizeBarangayQuery('Guadalupe')).toBe('guadalupe');
      expect(normalizeBarangayQuery('Brgy. Pasil')).toBe('pasil');
    });
  });
});
