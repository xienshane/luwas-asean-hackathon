import { describe, expect, it } from 'vitest';
import { normalizeSemaphorePayload } from './normalize';

describe('normalizeSemaphorePayload', () => {
  it('normalizes a JSON-style payload', () => {
    const n = normalizeSemaphorePayload({
      message_id: 123,
      number: '+639171234567',
      message: 'LUWAS baha sa Pasil',
      recipient: '29290',
      received_at: '2026-06-12T08:00:00Z',
    });
    expect(n).toEqual({
      message: 'LUWAS baha sa Pasil',
      sender: '+639171234567',
      receivedAt: '2026-06-12T08:00:00Z',
    });
  });

  it('accepts form-encoded string values and missing optionals', () => {
    const n = normalizeSemaphorePayload({ number: '09171234567', message: 'tabang' });
    expect(n).toEqual({ message: 'tabang', sender: '09171234567', receivedAt: null });
  });

  it('rejects payloads without a message body', () => {
    expect(normalizeSemaphorePayload({ number: '0917' })).toBeNull();
    expect(normalizeSemaphorePayload(null)).toBeNull();
  });
});
