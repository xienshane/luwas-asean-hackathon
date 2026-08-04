import { describe, expect, it } from 'vitest';
import { dbReportToUi, mergeReport, timeAgo, type CoordinatorFieldReport } from './adapters';

// Rows now come from the coordinator_field_reports view: the barangay name is
// joined server-side and lat/lng are already resolved (report location → barangay
// centroid fallback), so the adapter no longer needs a client-side directory.
const baseRow: CoordinatorFieldReport = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  barangay_id: 'b-uuid-1',
  barangay_name: 'Guadalupe',
  source: 'app',
  raw_text: 'nagsaka ang tubig',
  translated_text: 'water rising',
  population_estimate: 50,
  needs_severity: 'moderate',
  road_status: 'passable',
  road_impassable: false,
  confidence: 1,
  status: 'pending',
  created_at: '2026-06-12T08:00:00Z',
  offline_synced: false,
  lat: 10.31,
  lng: 123.9,
};

describe('dbReportToUi', () => {
  it('maps a row into the UI shape, resolving the name from the row', () => {
    const ui = dbReportToUi(baseRow)!;
    expect(ui.latitude).toBe(10.31);
    expect(ui.longitude).toBe(123.9);
    expect(ui.barangayName).toBe('Guadalupe'); // from the server-side join, not a capped client map
    expect(ui.rawText).toBe('nagsaka ang tubig');
    expect(ui.translatedText).toBe('water rising');
    expect(ui.needsSeverity).toBe('medium'); // canonical "moderate" -> UI "medium"
    expect(ui.reporterName).toBe('Field App');
  });

  it('falls back to "Unknown barangay" only when the joined name is null', () => {
    expect(dbReportToUi({ ...baseRow, barangay_name: null })!.barangayName).toBe('Unknown barangay');
  });

  it('labels offline-synced and SMS reports for the coordinator', () => {
    expect(dbReportToUi({ ...baseRow, offline_synced: true })!.reporterName).toBe(
      'Field App · offline sync',
    );
    expect(dbReportToUi({ ...baseRow, source: 'sms' })!.reporterName).toBe('SMS Intake');
  });

  it('returns null when no coordinates are resolvable', () => {
    expect(dbReportToUi({ ...baseRow, lat: null, lng: null })).toBeNull();
  });

  it('reports a missing severity as unknown, not low', () => {
    const ui = dbReportToUi({ ...baseRow, needs_severity: null });
    expect(ui?.needsSeverity).toBe('unknown');
  });

  it('reports an unrecognised severity as unknown', () => {
    const ui = dbReportToUi({ ...baseRow, needs_severity: 'catastrophic' });
    expect(ui?.needsSeverity).toBe('unknown');
  });
});

describe('mergeReport', () => {
  const a = dbReportToUi(baseRow)!;
  it('prepends a new report', () => {
    expect(mergeReport([], a)).toEqual([a]);
  });
  it('replaces an existing report by id (no duplicates)', () => {
    const updated = { ...a, status: 'confirmed' as const };
    const merged = mergeReport([a], updated);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('confirmed');
  });
});

describe('timeAgo', () => {
  it('formats minutes and hours', () => {
    const now = new Date('2026-06-12T08:30:00Z');
    expect(timeAgo('2026-06-12T08:25:00Z', now)).toBe('5m ago');
    expect(timeAgo('2026-06-12T06:30:00Z', now)).toBe('2h ago');
  });
});
