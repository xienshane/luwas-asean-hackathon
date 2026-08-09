import { describe, it, expect } from 'vitest';
import { roadBlockRequest, rerouteTriggerFor, type ImpassableReport } from './roadStatus';

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

describe('rerouteTriggerFor', () => {
  const since = Date.parse('2026-06-16T10:00:00Z');
  const report = (o: Partial<ImpassableReport> = {}): ImpassableReport => ({
    roadImpassable: true, source: 'sms', status: 'pending',
    createdAt: '2026-06-16T10:00:05Z', ...o,
  });

  it('fires when a coordinator confirms an impassable report', () => {
    expect(rerouteTriggerFor(report({ status: 'confirmed' }), 'pending', since)).toBe('confirmed');
  });

  it('fires on confirmation even for a report seeded long before the session', () => {
    expect(rerouteTriggerFor(
      report({ status: 'confirmed', createdAt: '2026-06-15T02:00:00Z' }), 'pending', since,
    )).toBe('confirmed');
  });

  it('does not fire while the report is only pending — the block waits for a person', () => {
    expect(rerouteTriggerFor(report(), undefined, since)).toBeNull();
    expect(rerouteTriggerFor(report(), 'pending', since)).toBeNull();
  });

  it('does not re-fire for a report already confirmed when the dashboard opened', () => {
    expect(rerouteTriggerFor(report({ status: 'confirmed' }), undefined, since)).toBeNull();
    expect(rerouteTriggerFor(report({ status: 'confirmed' }), 'confirmed', since)).toBeNull();
  });

  it('fires on arrival for a Field App report, which blocked its edges on submission', () => {
    expect(rerouteTriggerFor(report({ source: 'app' }), undefined, since)).toBe('arrived');
  });

  it('ignores a Field App report that predates the session (no replay on load)', () => {
    expect(rerouteTriggerFor(
      report({ source: 'app', createdAt: '2026-06-16T09:59:00Z' }), undefined, since,
    )).toBeNull();
  });

  it('ignores a report that does not flag a road impassable at all', () => {
    expect(rerouteTriggerFor(
      report({ roadImpassable: false, status: 'confirmed' }), 'pending', since)).toBeNull();
  });
});
