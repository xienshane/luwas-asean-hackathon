'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchReportCounts, type ReportCounts } from '@/lib/supabase/coordinator';
import { DEFAULT_REGION, type RegionId } from '@/lib/regions';

// Matches useLiveReports' safety-net poll, so the counters and the list they head
// never drift by more than one interval.
const POLL_MS = 20_000;

/**
 * Province-wide pending/critical counters, read from the database rather than
 * derived from the 100 reports the dashboard holds.
 *
 * `refresh` exists for the actions that change a count instantly — confirming or
 * flagging a report — so the counter drops the moment the coordinator acts instead
 * of up to POLL_MS later. The poll then covers everything else (SMS arrivals,
 * another coordinator working the same queue).
 *
 * `counts` is null until the first fetch resolves; callers fall back to whatever
 * they can derive locally rather than rendering a zero that isn't true.
 */
export function useReportCounts(
  region: RegionId = DEFAULT_REGION,
): { counts: ReportCounts | null; refresh: () => Promise<void> } {
  // Counts are stamped with the region they were fetched for. Reading them back through
  // that stamp means a switch cannot flash the previous pack's totals over the new map —
  // stale counts render as null (the caller's "not known yet" state) rather than as a
  // confident wrong number. Doing it here rather than clearing state in the effect keeps
  // the render path free of a synchronous setState.
  const [stamped, setStamped] = useState<{ region: RegionId; counts: ReportCounts } | null>(null);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchReportCounts(region);
      if (!cancelledRef.current) setStamped({ region, counts: next });
    } catch (err) {
      // A failed count must not blank a number the coordinator is reading — keep
      // the last known value and let the next poll correct it.
      console.error('Failed to refresh report counts', err);
    }
  }, [region]);

  useEffect(() => {
    cancelledRef.current = false;
    // The lint rule cannot see through the async boundary: refresh() awaits a
    // network round trip before it ever calls setCounts, so nothing is set
    // synchronously during the effect and no cascading render occurs. This is the
    // "subscribe to an external system" case the rule documents as allowed — the
    // immediate call is the first tick of the poll below, not a render-phase write.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const id = setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [refresh]);

  return { counts: stamped?.region === region ? stamped.counts : null, refresh };
}
