import { describe, expect, it, vi } from 'vitest';
import type { ParseResponse } from '@/lib/types/parse';
import { handleInboundSms, type InboundSmsDeps } from './handle';

const parseResponse = (over: Partial<ParseResponse['field_report']> = {}): ParseResponse => ({
  field_report: {
    source: 'parsed',
    raw_text: 'LUWAS baha sa Pasil, mga 120 ka tawo',
    location_text: 'Pasil',
    population_estimate: 120,
    needs_severity: 'critical',
    road_status: 'impassable',
    road_impassable: true,
    confidence: 0.9,
    status: 'pending',
    ...over,
  },
  extraction: {
    location: 'Pasil',
    location_confidence: 0.9,
    population_estimate: 120,
    population_confidence: 0.9,
    needs_severity: 'critical',
    needs_severity_confidence: 0.9,
    road_status: 'impassable',
    road_status_confidence: 0.9,
  },
  provider: 'sea-lion',
  needs_review: false,
  latency_ms: 800,
  translated_text: 'flood in Pasil, about 120 people',
});

const pasil = { id: 'b-uuid-pasil', name: 'Pasil', lat: 10.2917, lng: 123.8936 };

function deps(overrides: Partial<InboundSmsDeps> = {}): InboundSmsDeps & { rows: unknown[] } {
  const rows: unknown[] = [];
  return {
    rows,
    parse: vi.fn(async () => parseResponse()),
    findBarangay: vi.fn(async () => pasil),
    insertReport: vi.fn(async (row) => {
      rows.push(row);
      return 'inserted-id';
    }),
    ...overrides,
  };
}

describe('handleInboundSms', () => {
  const input = { message: 'LUWAS baha sa Pasil, mga 120 ka tawo', sender: '+639171234567', receivedAt: null };

  it('parses, geocodes, and inserts a pending sms report at the barangay centroid', async () => {
    const d = deps();
    const result = await handleInboundSms(input, d);
    expect(result.status).toBe('pending');
    const row = d.rows[0] as Record<string, unknown>;
    expect(row.source).toBe('sms');
    expect(row.barangay_id).toBe('b-uuid-pasil');
    expect(row.location).toBe('SRID=4326;POINT(123.8936 10.2917)');
    expect(row.needs_severity).toBe('critical');
    expect(row.road_impassable).toBe(true);
    expect(row.translated_text).toBe('flood in Pasil, about 120 people');
  });

  it('still inserts (flagged, confidence 0) when the parse service fails', async () => {
    const d = deps({ parse: vi.fn(async () => Promise.reject(new Error('502'))) });
    const result = await handleInboundSms(input, d);
    expect(result.status).toBe('flagged');
    const row = d.rows[0] as Record<string, unknown>;
    expect(row.confidence).toBe(0);
    expect(row.raw_text).toBe(input.message); // the SMS text is never lost
  });

  it('flags when the parser is below threshold', async () => {
    const d = deps({
      parse: vi.fn(async () => parseResponse({ status: 'flagged', confidence: 0.3 })),
    });
    const result = await handleInboundSms(input, d);
    expect(result.status).toBe('flagged');
  });

  it('flags when no barangay matches (no pin possible)', async () => {
    const d = deps({ findBarangay: vi.fn(async () => null) });
    const result = await handleInboundSms(input, d);
    expect(result.status).toBe('flagged');
    const row = d.rows[0] as Record<string, unknown>;
    expect(row.location).toBeNull();
  });
});
