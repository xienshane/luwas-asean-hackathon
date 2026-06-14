// Validates the volunteer report submission posted to /api/reports.
// Vocabulary mirrors the canonical parse contract (web/lib/types/parse.ts):
// needs_severity ∈ low|moderate|high|critical, road_status ∈ passable|impassable|unknown.
import type { NeedsSeverity, RoadStatus } from '@/lib/types/parse';

export interface ReportSubmission {
  /** Client-generated uuid — Background Sync replays upsert on it (last write wins). */
  id: string;
  barangay_id: string;
  raw_text: string;
  population_estimate: number | null;
  needs_severity: NeedsSeverity;
  road_status: RoadStatus;
  /** Derived: road_status === 'impassable'. */
  road_impassable: boolean;
  lat: number | null;
  lng: number | null;
  /** Device time at submit (ISO). Compared with server time for offline_synced. */
  captured_at: string;
}

export type ValidationResult =
  | { ok: true; value: ReportSubmission }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEVERITIES: NeedsSeverity[] = ['low', 'moderate', 'high', 'critical'];
const ROAD_STATUSES: RoadStatus[] = ['passable', 'impassable', 'unknown'];

export function validateReportSubmission(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const o = input as Record<string, unknown>;

  if (typeof o.id !== 'string' || !UUID_RE.test(o.id)) {
    return { ok: false, error: 'id must be a uuid' };
  }
  if (typeof o.barangay_id !== 'string' || !UUID_RE.test(o.barangay_id)) {
    return { ok: false, error: 'barangay_id must be a uuid' };
  }
  if (typeof o.raw_text !== 'string' || o.raw_text.length > 2000) {
    return { ok: false, error: 'raw_text must be a string of at most 2000 chars' };
  }
  const pop = o.population_estimate ?? null;
  if (pop !== null && (!Number.isInteger(pop) || (pop as number) < 0)) {
    return { ok: false, error: 'population_estimate must be a non-negative integer or null' };
  }
  if (!SEVERITIES.includes(o.needs_severity as NeedsSeverity)) {
    return { ok: false, error: `needs_severity must be one of ${SEVERITIES.join('|')}` };
  }
  if (!ROAD_STATUSES.includes(o.road_status as RoadStatus)) {
    return { ok: false, error: `road_status must be one of ${ROAD_STATUSES.join('|')}` };
  }
  const lat = o.lat ?? null;
  const lng = o.lng ?? null;
  if ((lat === null) !== (lng === null)) {
    return { ok: false, error: 'lat and lng must be provided together' };
  }
  if (lat !== null) {
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        lat < -90 || lat > 90 || (lng as number) < -180 || (lng as number) > 180) {
      return { ok: false, error: 'lat/lng out of range' };
    }
  }
  if (typeof o.captured_at !== 'string' || Number.isNaN(Date.parse(o.captured_at))) {
    return { ok: false, error: 'captured_at must be an ISO timestamp' };
  }

  return {
    ok: true,
    value: {
      id: o.id,
      barangay_id: o.barangay_id,
      raw_text: o.raw_text,
      population_estimate: pop as number | null,
      needs_severity: o.needs_severity as NeedsSeverity,
      road_status: o.road_status as RoadStatus,
      road_impassable: o.road_status === 'impassable',
      lat: lat as number | null,
      lng: lng as number | null,
      captured_at: o.captured_at,
    },
  };
}
