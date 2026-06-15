// Adapts live Supabase rows into the coordinator UI types. The dashboard runs
// entirely on live data; these adapters shape inbound rows (field reports,
// barangay directory) for the components.
import type { FieldReport } from '@/lib/types/coordinator';
import { geometryToLngLat } from './wkb';

export interface BarangayDirectoryEntry {
  id: string;
  name: string;
  city_municipality: string | null;
  lat: number;
  lng: number;
  population: number | null;
}

export interface DbFieldReport {
  id: string;
  barangay_id: string | null;
  source: 'app' | 'sms' | 'parsed';
  raw_text: string | null;
  location: unknown;
  population_estimate: number | null;
  needs_severity: string | null;
  road_status: string | null;
  road_impassable: boolean;
  confidence: number | string | null;
  status: 'pending' | 'confirmed' | 'flagged';
  created_at: string;
  offline_synced?: boolean | null;
}

// Canonical DB vocabulary (low|moderate|high|critical) -> the UI type's union.
const SEVERITY_UI: Record<string, FieldReport['needsSeverity']> = {
  low: 'low',
  moderate: 'medium',
  high: 'high',
  critical: 'critical',
};

export function dbReportToUi(
  row: DbFieldReport,
  directory: Map<string, BarangayDirectoryEntry>,
): FieldReport | null {
  const fromGeom = geometryToLngLat(row.location);
  const brgy = row.barangay_id ? directory.get(row.barangay_id) : undefined;
  const lat = fromGeom?.lat ?? brgy?.lat;
  const lng = fromGeom?.lng ?? brgy?.lng;
  if (lat == null || lng == null) return null; // nothing to pin (e.g. unmatched SMS)

  const reporterName =
    row.source === 'sms'
      ? 'SMS Intake'
      : row.source === 'parsed'
        ? 'NLP Parsed'
        : row.offline_synced
          ? 'Field App · offline sync'
          : 'Field App';

  return {
    id: row.id,
    barangayId: row.barangay_id,
    barangayName: brgy?.name ?? 'Unknown barangay',
    reporterName,
    source: row.source,
    rawText: row.raw_text ?? '',
    populationEstimate: row.population_estimate ?? 0,
    needsSeverity: SEVERITY_UI[row.needs_severity ?? ''] ?? 'low',
    roadStatus: row.road_status ?? 'unknown',
    roadImpassable: row.road_impassable,
    impassableEdgeId: null,
    confidence: Number(row.confidence ?? 1),
    status: row.status,
    createdAt: row.created_at,
    latitude: lat,
    longitude: lng,
  };
}

/** Replace-by-id or prepend — keeps realtime UPDATE + duplicate INSERT idempotent. */
export function mergeReport(list: FieldReport[], report: FieldReport): FieldReport[] {
  const i = list.findIndex((r) => r.id === report.id);
  if (i === -1) return [report, ...list];
  const next = list.slice();
  next[i] = report;
  return next;
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
