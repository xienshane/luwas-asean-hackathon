import { describe, expect, it } from 'vitest';
import { reportPinTier, isLoudTier, DOT_OPACITY, DOT_RADIUS, type PinnableReport } from './reportPins';

const report = (over: Partial<PinnableReport> = {}): PinnableReport => ({
  status: 'pending',
  needsSeverity: 'medium',
  ...over,
});

describe('reportPinTier', () => {
  it('puts critical pending reports in the loud tier', () => {
    expect(reportPinTier(report({ status: 'pending', needsSeverity: 'critical' }))).toBe('act');
  });

  it('puts flagged reports in the loud tier whatever their severity', () => {
    // Flagged is an open coordinator decision; the parser's severity does not
    // get to quiet it down.
    expect(reportPinTier(report({ status: 'flagged', needsSeverity: 'low' }))).toBe('act');
    expect(reportPinTier(report({ status: 'flagged', needsSeverity: 'critical' }))).toBe('act');
  });

  it('elevates high-severity pending reports without making them loud', () => {
    expect(reportPinTier(report({ needsSeverity: 'high' }))).toBe('elevated');
  });

  it('treats the rest of the queue as routine', () => {
    for (const needsSeverity of ['medium', 'low', 'unknown'] as const) {
      expect(reportPinTier(report({ needsSeverity }))).toBe('routine');
    }
  });

  it('quiets every confirmed report regardless of severity', () => {
    // Confirmed work is evidence, not a task — a confirmed critical must not
    // shout over a pending one that still needs a decision.
    for (const needsSeverity of ['critical', 'high', 'medium', 'low', 'unknown'] as const) {
      expect(reportPinTier(report({ status: 'confirmed', needsSeverity }))).toBe('done');
    }
  });
});

describe('isLoudTier', () => {
  it('is true only for the act tier', () => {
    expect(isLoudTier('act')).toBe(true);
    expect(isLoudTier('elevated')).toBe(false);
    expect(isLoudTier('routine')).toBe(false);
    expect(isLoudTier('done')).toBe(false);
  });
});

describe('dot ramps', () => {
  it('orders size and opacity by urgency', () => {
    expect(DOT_RADIUS.elevated[0]).toBeGreaterThan(DOT_RADIUS.routine[0]);
    expect(DOT_RADIUS.routine[0]).toBeGreaterThan(DOT_RADIUS.done[0]);
    expect(DOT_OPACITY.elevated).toBeGreaterThan(DOT_OPACITY.routine);
    expect(DOT_OPACITY.routine).toBeGreaterThan(DOT_OPACITY.done);
  });

  it('grows every tier with zoom so density stays readable', () => {
    for (const [min, max] of Object.values(DOT_RADIUS)) {
      expect(max).toBeGreaterThan(min);
    }
  });

  it('keeps every tier at or above the 3:1 graphical contrast floor', () => {
    for (const opacity of Object.values(DOT_OPACITY)) {
      expect(opacity).toBeGreaterThanOrEqual(0.6);
    }
  });
});
