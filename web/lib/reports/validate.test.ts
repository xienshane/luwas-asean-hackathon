import { describe, expect, it } from 'vitest';
import { validateReportSubmission } from './validate';

const valid = {
  id: '7f1e1f6a-2f4b-4f6e-9d3a-1c2b3d4e5f60',
  barangay_id: 'c0000000-0000-0000-0000-000000000003',
  raw_text: 'Flooding near the chapel, families on roofs.',
  population_estimate: 120,
  needs_severity: 'high',
  road_status: 'impassable',
  lat: 10.3157,
  lng: 123.8854,
  captured_at: '2026-06-12T08:30:00.000Z',
};

describe('validateReportSubmission', () => {
  it('accepts a complete valid payload', () => {
    const r = validateReportSubmission(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe(valid.id);
      expect(r.value.road_impassable).toBe(true); // derived from road_status
    }
  });

  it('accepts null GPS and null population', () => {
    const r = validateReportSubmission({ ...valid, lat: null, lng: null, population_estimate: null });
    expect(r.ok).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(validateReportSubmission({ ...valid, id: 'fr-1' }).ok).toBe(false);
  });

  it('rejects an unknown severity', () => {
    expect(validateReportSubmission({ ...valid, needs_severity: 'medium' }).ok).toBe(false);
  });

  it('rejects lat without lng', () => {
    expect(validateReportSubmission({ ...valid, lng: null }).ok).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(validateReportSubmission({ ...valid, lat: 91 }).ok).toBe(false);
  });

  it('rejects an unparseable captured_at', () => {
    expect(validateReportSubmission({ ...valid, captured_at: 'yesterday' }).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateReportSubmission(null).ok).toBe(false);
  });
});
