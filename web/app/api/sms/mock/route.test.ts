import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEMO_PRESETS } from '@/lib/demo/presets';
import type { SmsReportRow } from '@/lib/sms/handle';

// Import the presets rather than retyping them: a drifted web copy fails here, before the
// stage console fires a string W3's live parser test never validated.
const [BISAYA, VIETNAMESE] = DEMO_PRESETS;

const inserted: SmsReportRow[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: SmsReportRow) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: 'report-1' }, error: null }) }) };
      },
    }),
  }),
}));

// Two country packs are loaded, and a name only resolves inside its own. Guadalupe is
// Cebu; Phường An Hải is Da Nang. Asking the wrong region finds nothing — that scoping
// is what stops a Vietnamese ward matching a Philippine barangay.
// Signature mirrors the real helper: (adminClient, name, region).
vi.mock('@/lib/sms/barangay', () => ({
  findBarangayByName: async (_admin: unknown, name: string, region = 'cebu') => {
    if (region === 'cebu' && /guadalupe/i.test(name)) {
      return { id: 'b-guadalupe', name: 'Guadalupe', lat: 10.31, lng: 123.87 };
    }
    if (region === 'danang' && /an hải/i.test(name)) {
      return { id: 'w-an-hai', name: 'Phường An Hải', lat: 16.0689, lng: 108.2368 };
    }
    return null;
  },
}));

vi.mock('@/lib/ai/parse', () => ({
  parseFieldReportText: async (text: string) => {
    const vietnamese = text.includes('An Hải');
    return {
      field_report: {
        source: 'parsed', raw_text: text,
        location_text: vietnamese ? 'phường An Hải' : 'Guadalupe',
        population_estimate: 400, // 80 families x ~5 people
        needs_severity: 'high', road_status: 'unknown', road_impassable: false,
        confidence: 0.88, status: 'pending',
      },
      extraction: {
        location: vietnamese ? 'phường An Hải' : 'Guadalupe', location_confidence: 0.9,
        population_estimate: 400, population_confidence: 0.8,
        needs_severity: 'high', needs_severity_confidence: 0.85,
        road_status: 'unknown', road_status_confidence: 0.5,
      },
      provider: 'sea-lion', needs_review: false, latency_ms: 900,
      translated_text: vietnamese
        ? 'Severe flooding in An Hai ward, Da Nang. About 80 households isolated, clean water needed.'
        : 'Severe flooding in Guadalupe, about 80 families affected',
    };
  },
}));

const fire = async (message: string, region?: string) => {
  const { POST } = await import('./route');
  return POST(new Request('http://x/api/sms/mock?token=test-secret', {
    method: 'POST', body: JSON.stringify(region ? { message, region } : { message }),
    headers: { 'content-type': 'application/json' },
  }));
};

beforeEach(() => {
  inserted.length = 0;
  process.env.ENABLE_SMS_MOCK = 'true';
  process.env.SMS_WEBHOOK_SECRET = 'test-secret';
});

describe('demo preset intake through /api/sms/mock', () => {
  it('lands the Bisaya preset as a pending, geocoded report', async () => {
    const res = await fire(BISAYA.message);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: 'pending' });
    expect(inserted[0]).toMatchObject({
      source: 'sms', barangay_id: 'b-guadalupe',
      population_estimate: 400, needs_severity: 'high', status: 'pending',
    });
    expect(inserted[0].location).toBe('SRID=4326;POINT(123.87 10.31)');
  });

  it('lands the Vietnamese preset as a pending, geocoded report in the Da Nang pack', async () => {
    const res = await fire(VIETNAMESE.message, 'danang');
    expect(res.status).toBe(200);
    // S10: with the Da Nang pack loaded the ward resolves like any other, through the
    // same pipeline and with no model change. That equivalence is the whole claim.
    expect(await res.json()).toMatchObject({ ok: true, status: 'pending' });
    expect(inserted[0]).toMatchObject({
      source: 'sms', barangay_id: 'w-an-hai',
      population_estimate: 400, needs_severity: 'high', status: 'pending',
    });
    expect(inserted[0].location).toBe('SRID=4326;POINT(108.2368 16.0689)');
    expect(inserted[0].translated_text).toMatch(/flood/i);
    expect(inserted[0].raw_text).toBe(VIETNAMESE.message);
  });

  it('flags the same Vietnamese report when geocoded against the wrong region', async () => {
    // Region scoping is load-bearing: a Da Nang ward must not resolve to a Philippine
    // barangay just because the substring matches.
    const res = await fire(VIETNAMESE.message);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: 'flagged' });
    expect(inserted[0]).toMatchObject({ barangay_id: null, status: 'flagged' });
  });

  it('is 404 unless the mock intake is explicitly enabled', async () => {
    process.env.ENABLE_SMS_MOCK = 'false';
    expect((await fire(BISAYA.message)).status).toBe(404);
  });

  it('rejects a wrong token', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('http://x/api/sms/mock?token=wrong', {
      method: 'POST', body: JSON.stringify({ message: BISAYA.message }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(401);
  });
});
