// Phase 4.5: pure decision logic for the coordinator road-status control, kept out of
// the big dashboard component so it can be unit-tested.

export type RoadStatusValue = 'open' | 'slow' | 'blocked' | 'damaged';

export interface RoadBlockRequest {
  impassable: boolean;
  reason?: string;
}

// Map a coordinator-chosen edge status to a /api/road-status request, or null when the
// status is advisory only ("slow") and must NOT change the routing graph.
export function roadBlockRequest(status: RoadStatusValue, notes?: string): RoadBlockRequest | null {
  if (status === 'slow') return null;
  if (status === 'open') return { impassable: false };
  // blocked | damaged -> impassable, attributed with the coordinator's notes (or a default).
  const reason = notes?.trim() || 'coordinator block';
  return { impassable: true, reason };
}

export interface ImpassableReport {
  roadImpassable: boolean;
  source: 'app' | 'sms' | 'parsed';
  status: 'pending' | 'confirmed' | 'flagged';
  createdAt: string;
}

/** Which event closed the road, for the activity log. */
export type RerouteTrigger = 'arrived' | 'confirmed';

// A report moves the routing graph at exactly two moments, and the client must re-route
// at the same two — announcing a redraw at any other moment describes something that
// did not happen.
//
//   'arrived'   — a Field App report submitted by a volunteer standing at the closure,
//                 who picked the blocked edges by hand. /api/reports blocks those on
//                 submission (block_edges_for_report), so the graph has already moved by
//                 the time the row reaches us. Gated on sinceMs so opening the dashboard
//                 does not replay every historic closure.
//   'confirmed' — everything else. An SMS or parsed report only names a road; the block
//                 waits for a coordinator, and field_report_block_edge fires on the
//                 status change to 'confirmed'. prevStatus is what makes this a
//                 TRANSITION rather than a standing condition: without it, a report
//                 confirmed hours ago would re-route on every page load, and a report
//                 seeded before the session would never re-route at all.
export function rerouteTriggerFor(
  report: ImpassableReport,
  prevStatus: ImpassableReport['status'] | undefined,
  sinceMs: number,
): RerouteTrigger | null {
  if (!report.roadImpassable) return null;
  if (report.status === 'confirmed' && prevStatus !== undefined && prevStatus !== 'confirmed') {
    return 'confirmed';
  }
  if (prevStatus === undefined && report.source === 'app' && Date.parse(report.createdAt) >= sinceMs) {
    return 'arrived';
  }
  return null;
}
