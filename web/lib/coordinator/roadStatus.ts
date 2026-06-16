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

// True when a report should trigger an automatic re-route: it flags a road impassable
// AND arrived after the coordinator opened the dashboard (sinceMs). The cutoff stops
// pre-existing reports from re-routing on page load.
export function isLiveImpassableReport(
  report: { roadImpassable: boolean; createdAt: string },
  sinceMs: number,
): boolean {
  return report.roadImpassable && Date.parse(report.createdAt) >= sinceMs;
}
