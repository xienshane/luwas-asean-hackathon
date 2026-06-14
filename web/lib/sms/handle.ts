// Core inbound-SMS flow, dependency-injected for unit testing:
//   normalize -> SEA-LION /parse (Gemini fallback inside the service)
//   -> barangay geocode -> field_reports insert (source 'sms').
// An SMS is NEVER dropped: parse failure or no barangay match still inserts a
// flagged, low-confidence report for coordinator review (DevPlan 2.5 rule).
// The sender's number is NOT persisted (PII minimization; field_reports has no
// sender column by design — follow-up channel design is post-hackathon).
import type { ParseResponse } from '@/lib/types/parse';
import type { BarangayMatch } from './barangay';
import type { NormalizedInboundSms } from './normalize';

export interface SmsReportRow {
  source: 'sms';
  raw_text: string;
  barangay_id: string | null;
  location: string | null; // EWKT
  population_estimate: number | null;
  needs_severity: string | null;
  road_status: string;
  road_impassable: boolean;
  confidence: number;
  status: 'pending' | 'flagged';
  captured_at: string;
}

export interface InboundSmsDeps {
  parse: (text: string) => Promise<ParseResponse>;
  findBarangay: (locationText: string) => Promise<BarangayMatch | null>;
  insertReport: (row: SmsReportRow) => Promise<string>;
}

export async function handleInboundSms(
  input: NormalizedInboundSms,
  deps: InboundSmsDeps,
): Promise<{ reportId: string; status: 'pending' | 'flagged' }> {
  let parsed: ParseResponse | null = null;
  try {
    parsed = await deps.parse(input.message);
  } catch {
    parsed = null; // service down — fall through to a flagged raw insert
  }
  const fr = parsed?.field_report ?? null;

  const match = fr?.location_text ? await deps.findBarangay(fr.location_text) : null;

  const status: 'pending' | 'flagged' =
    !fr || fr.status === 'flagged' || !match ? 'flagged' : 'pending';

  const row: SmsReportRow = {
    source: 'sms',
    raw_text: input.message,
    barangay_id: match?.id ?? null,
    location: match ? `SRID=4326;POINT(${match.lng} ${match.lat})` : null,
    population_estimate: fr?.population_estimate ?? null,
    needs_severity: fr?.needs_severity ?? null,
    road_status: fr?.road_status ?? 'unknown',
    road_impassable: fr?.road_impassable ?? false,
    confidence: fr?.confidence ?? 0,
    status,
    captured_at: input.receivedAt ?? new Date().toISOString(),
  };

  const reportId = await deps.insertReport(row);
  return { reportId, status };
}
