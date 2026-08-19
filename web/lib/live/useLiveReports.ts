'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { FieldReport } from '@/lib/types/coordinator';
import { dbReportToUi, mergeReport, type CoordinatorFieldReport } from './adapters';
import { DEFAULT_REGION, type RegionId } from '@/lib/regions';

// Feeds live field_reports into the dashboard's report state:
// initial fetch (last INITIAL_FETCH_LIMIT) + a realtime channel for INSERT/UPDATE.
// setReports is a useState setter — stable identity, safe in the dep array.
//
// Rows are read from the coordinator_field_reports view (barangay name + pin
// lat/lng resolved server-side). Realtime postgres_changes can only target a
// table, so we subscribe to field_reports and refetch the enriched row from the
// view by id — this is what removes the old client-side directory and its
// 1,000-row "Unknown barangay" cap.

/**
 * How many reports the map holds at once.
 *
 * At 100 the window was smaller than a single province's active queue, so the map
 * showed a thin scatter regardless of how many reports existed — and the counters,
 * which read province-wide totals from the database, disagreed with what was drawn.
 * A coordinator told "300 awaiting" and shown 100 dots reasonably concludes the map
 * is the truth and the number is decoration.
 *
 * The map's job here is to make ABSENCE legible: a barangay with no pin is the
 * signal. That reading only holds if the pins present are all of them, so the
 * window has to clear the queue rather than sample it.
 *
 * Cost is bounded — the quiet tiers render as MapLibre circle features from one
 * GeoJSON source (reportPins.ts), which is a few hundred points, not a few hundred
 * DOM nodes. Only the 'act' tier becomes a marker, and that tier is small by design.
 */
const INITIAL_FETCH_LIMIT = 500;

export function useLiveReports(
  setReports: React.Dispatch<React.SetStateAction<FieldReport[]>>,
  region: RegionId = DEFAULT_REGION,
) {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // The effect re-runs on region change, and mergeReport accumulates. Without this the
    // feed would keep the previous country's reports after a switch.
    setReports([]);

    // A report with no region never geocoded, so it belongs to no country pack. Those
    // stay visible everywhere — an unplaced report is the one a coordinator must not
    // lose — while a report placed in another country is filtered out.
    const inRegion = (row: CoordinatorFieldReport) => {
      const r = (row as { region?: string | null }).region;
      return r == null || r === region;
    };

    const applyRow = (row: CoordinatorFieldReport) => {
      if (!inRegion(row)) return;
      const ui = dbReportToUi(row);
      if (ui) setReports((prev) => mergeReport(prev, ui));
    };

    const fetchOne = async (id: string) => {
      const { data } = await supabase
        .from('coordinator_field_reports')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!cancelled && data) applyRow(data as CoordinatorFieldReport);
    };

    const fetchRecent = async () => {
      const { data: rows } = await supabase
        .from('coordinator_field_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(INITIAL_FETCH_LIMIT);
      if (cancelled || !rows) return;
      [...rows].reverse().forEach((row) => applyRow(row as CoordinatorFieldReport));
    };

    // Realtime evaluates RLS as the socket's own identity. field_reports SELECT is
    // coordinator-only (no anon), so the websocket MUST carry the coordinator JWT or
    // every change event is silently dropped. Push the token before subscribing and
    // refresh it whenever the session changes.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const start = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      await fetchRecent();
      if (cancelled) return;

      channel = supabase
        .channel('live-field-reports')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'field_reports' },
          (payload) => fetchOne((payload.new as { id: string }).id),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'field_reports' },
          (payload) => fetchOne((payload.new as { id: string }).id),
        )
        .subscribe();
    };
    void start();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? '');
    });

    // Safety net: realtime is best-effort. Poll the enriched view every 20s and merge;
    // mergeReport is idempotent so this never duplicates a row that realtime already added.
    const pollId = setInterval(() => { void fetchRecent(); }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [setReports, region]);
}
