'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { FieldReport } from '@/lib/types/coordinator';
import { dbReportToUi, mergeReport, type CoordinatorFieldReport } from './adapters';

// Feeds live field_reports into the dashboard's report state:
// initial fetch (last 100) + a realtime channel for INSERT/UPDATE.
// setReports is a useState setter — stable identity, safe in the dep array.
//
// Rows are read from the coordinator_field_reports view (barangay name + pin
// lat/lng resolved server-side). Realtime postgres_changes can only target a
// table, so we subscribe to field_reports and refetch the enriched row from the
// view by id — this is what removes the old client-side directory and its
// 1,000-row "Unknown barangay" cap.
export function useLiveReports(
  setReports: React.Dispatch<React.SetStateAction<FieldReport[]>>,
) {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const applyRow = (row: CoordinatorFieldReport) => {
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
        .limit(100);
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

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [setReports]);
}
