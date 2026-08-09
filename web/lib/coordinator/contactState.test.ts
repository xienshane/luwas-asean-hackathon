import { describe, it, expect } from 'vitest';
import { contactState, elapsedHours, formatElapsed, SILENT_AFTER_HOURS } from './contactState';

describe('contactState', () => {
  it('reports a served barangay as reached', () => {
    expect(contactState({ served: true, hoursSinceContact: 0.5 })).toBe('reached');
  });

  it('lets delivery outrank the clock', () => {
    // Both "served" and "recently contacted" are true; reached is the stronger claim.
    expect(contactState({ served: true, hoursSinceContact: 1 })).toBe('reached');
    // Even a stale clock stays reached — relief did arrive, whenever that was.
    expect(contactState({ served: true, hoursSinceContact: 200 })).toBe('reached');
    expect(contactState({ served: true, hoursSinceContact: null })).toBe('reached');
  });

  it('reports recent confirmed contact as in-contact', () => {
    expect(contactState({ served: false, hoursSinceContact: 0 })).toBe('in-contact');
    expect(contactState({ served: false, hoursSinceContact: 2.5 })).toBe('in-contact');
  });

  it('treats the threshold itself as still in contact', () => {
    expect(contactState({ served: false, hoursSinceContact: SILENT_AFTER_HOURS })).toBe('in-contact');
    expect(contactState({ served: false, hoursSinceContact: SILENT_AFTER_HOURS + 0.01 })).toBe('silent');
  });

  it('reports a never-contacted barangay as silent', () => {
    expect(contactState({ served: false, hoursSinceContact: null })).toBe('silent');
  });

  it('reports stale contact as silent', () => {
    expect(contactState({ served: false, hoursSinceContact: 31 })).toBe('silent');
  });
});

describe('elapsedHours', () => {
  const now = Date.parse('2026-08-09T14:00:00Z');

  it('counts from the last confirmed contact when there is one', () => {
    expect(
      elapsedHours({ lastConfirmedContact: '2026-08-09T11:45:00Z', operationStartedAt: null, now }),
    ).toBe(2.25);
  });

  it('ignores the operation start once contact exists', () => {
    expect(
      elapsedHours({
        lastConfirmedContact: '2026-08-09T11:00:00Z',
        operationStartedAt: '2026-08-08T00:00:00Z',
        now,
      }),
    ).toBe(3);
  });

  it('advances with the clock rather than sitting on a snapshot', () => {
    const input = { lastConfirmedContact: '2026-08-09T11:45:00Z', operationStartedAt: null };
    const first = elapsedHours({ ...input, now })!;
    const later = elapsedHours({ ...input, now: now + 3_600_000 })!;
    expect(later - first).toBeCloseTo(1, 6);
  });

  it('falls back to time since the operation began when never contacted', () => {
    expect(
      elapsedHours({ lastConfirmedContact: null, operationStartedAt: '2026-08-08T23:53:00Z', now }),
    ).toBeCloseTo(14.1167, 3);
  });

  it('returns null when there is nothing to count from', () => {
    expect(elapsedHours({ lastConfirmedContact: null, operationStartedAt: null, now })).toBeNull();
  });

  it('returns null rather than NaN on an unparseable timestamp', () => {
    expect(
      elapsedHours({ lastConfirmedContact: null, operationStartedAt: 'not a date', now }),
    ).toBeNull();
  });

  it('never returns a negative elapsed time', () => {
    // Clock skew between the browser and the database must not render "-0:00:12".
    expect(
      elapsedHours({ lastConfirmedContact: '2026-08-09T14:12:00Z', operationStartedAt: null, now }),
    ).toBe(0);
  });
});

describe('formatElapsed', () => {
  it('formats as H:MM:SS to match the pitch HUD', () => {
    expect(formatElapsed(14.1167)).toBe('14:07:00');
    expect(formatElapsed(2.25)).toBe('2:15:00');
  });

  it('pads minutes and seconds but not hours', () => {
    expect(formatElapsed(1 + 3 / 60 + 7 / 3600)).toBe('1:03:07');
    expect(formatElapsed(0)).toBe('0:00:00');
  });

  it('keeps counting past 24 hours rather than wrapping', () => {
    expect(formatElapsed(31.5)).toBe('31:30:00');
    expect(formatElapsed(120)).toBe('120:00:00');
  });

  it('floors rather than rounds, so it never shows a second that has not passed', () => {
    expect(formatElapsed(1.99999)).toBe('1:59:59');
  });
});
