import { describe, it, expect } from 'vitest';
import { roadBlockRequest, isLiveImpassableReport } from './roadStatus';

describe('roadBlockRequest', () => {
  it('blocks on "blocked" with a default reason', () => {
    expect(roadBlockRequest('blocked')).toEqual({ impassable: true, reason: 'coordinator block' });
  });

  it('blocks on "damaged" and carries trimmed notes as the reason', () => {
    expect(roadBlockRequest('damaged', '  bridge washed out ')).toEqual({
      impassable: true, reason: 'bridge washed out',
    });
  });

  it('restores on "open"', () => {
    expect(roadBlockRequest('open')).toEqual({ impassable: false });
  });

  it('returns null for the advisory "slow" status (no graph change)', () => {
    expect(roadBlockRequest('slow')).toBeNull();
  });
});

describe('isLiveImpassableReport', () => {
  const since = Date.parse('2026-06-16T10:00:00Z');

  it('is true for an impassable report created after the cutoff', () => {
    expect(isLiveImpassableReport(
      { roadImpassable: true, createdAt: '2026-06-16T10:00:05Z' }, since)).toBe(true);
  });

  it('is false for a passable report', () => {
    expect(isLiveImpassableReport(
      { roadImpassable: false, createdAt: '2026-06-16T10:00:05Z' }, since)).toBe(false);
  });

  it('is false for an impassable report created before the cutoff (pre-existing on load)', () => {
    expect(isLiveImpassableReport(
      { roadImpassable: true, createdAt: '2026-06-16T09:59:00Z' }, since)).toBe(false);
  });
});
