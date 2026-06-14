import { describe, expect, it } from 'vitest';
import { dbReportToUi, mergeReport, timeAgo, type DbFieldReport } from './adapters';

const directory = new Map([
  ['b-uuid-1', { id: 'b-uuid-1', name: 'Guadalupe', city_municipality: 'Cebu City', lat: 10.3225, lng: 123.8845, population: 68420 }],
]);

const row: DbFieldReport = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  barangay_id: 'b-uuid-1',
  source: 'app',
  raw_text: 'water rising',
  location: { type: 'Point', coordinates: [123.9, 10.31] },
  population_estimate: 50,
  needs_severity: 'moderate',
  road_status: 'passable',
  road_impassable: false,
  confidence: 1,
  status: 'pending',
  created_at: '2026-06-12T08:00:00Z',
  offline_synced: false,
};

describe('dbReportToUi', () => {
  it('maps a row with geometry into the UI shape', () => {
    const ui = dbReportToUi(row, directory)!;
    expect(ui.latitude).toBe(10.31);
    expect(ui.longitude).toBe(123.9);
    expect(ui.barangayName).toBe('Guadalupe');
    expect(ui.needsSeverity).toBe('medium'); // canonical "moderate" -> UI "medium"
    expect(ui.reporterName).toBe('Field App');
  });

  it('falls back to the barangay centroid when location is null', () => {
    const ui = dbReportToUi({ ...row, location: null }, directory)!;
    expect(ui.latitude).toBeCloseTo(10.3225);
  });

  it('labels offline-synced and SMS reports for the coordinator', () => {
    expect(dbReportToUi({ ...row, offline_synced: true }, directory)!.reporterName).toBe(
      'Field App · offline sync',
    );
    expect(dbReportToUi({ ...row, source: 'sms' }, directory)!.reporterName).toBe('SMS Intake');
  });

  it('returns null when no coordinates are resolvable', () => {
    expect(dbReportToUi({ ...row, location: null, barangay_id: null }, directory)).toBeNull();
  });
});

describe('mergeReport', () => {
  const a = dbReportToUi(row, directory)!;
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
