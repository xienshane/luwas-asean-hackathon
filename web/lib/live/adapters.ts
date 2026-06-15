// Adapts live Supabase rows into the coordinator UI types. The dashboard runs
// entirely on live data; these adapters shape inbound rows for the components.
import type { FieldReport } from '@/lib/types/coordinator';

// A row from the coordinator_field_reports view: barangay name joined and pin
// lat/lng resolved (report location → barangay centroid) server-side, so no
// client-side directory (and no 1,000-row PostgREST cap) is involved.
export interface CoordinatorFieldReport {
  id: string;
  barangay_id: string | null;
  barangay_name: string | null;
  source: 'app' | 'sms' | 'parsed';
  raw_text: string | null;
  population_estimate: number | null;
  needs_severity: string | null;
  road_status: string | null;
  road_impassable: boolean;
  confidence: number | string | null;
  status: 'pending' | 'confirmed' | 'flagged';
  created_at: string;
  offline_synced?: boolean | null;
  lat: number | null;
  lng: number | null;
}

// Canonical DB vocabulary (low|moderate|high|critical) -> the UI type's union.
const SEVERITY_UI: Record<string, FieldReport['needsSeverity']> = {
  low: 'low',
  moderate: 'medium',
  high: 'high',
  critical: 'critical',
};

export function dbReportToUi(row: CoordinatorFieldReport): FieldReport | null {
  const { lat, lng } = row;
  if (lat == null || lng == null) return null; // nothing to pin (e.g. unmatched SMS, no centroid)

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
    barangayName: row.barangay_name ?? 'Unknown barangay',
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
