import { describe, expect, it } from 'vitest';
import { isOfflineSynced } from './offline';

describe('isOfflineSynced', () => {
  it('is false when the report arrives right after capture', () => {
    expect(isOfflineSynced('2026-06-12T08:30:00Z', new Date('2026-06-12T08:30:20Z'))).toBe(false);
  });

  it('is true when the report arrives over a minute after capture (queued offline)', () => {
    expect(isOfflineSynced('2026-06-12T08:30:00Z', new Date('2026-06-12T08:45:00Z'))).toBe(true);
  });
});
