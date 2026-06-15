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

    (async () => {
      const { data: rows } = await supabase
        .from('coordinator_field_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      (rows ?? []).reverse().forEach((row) => applyRow(row as CoordinatorFieldReport));
    })();

    const channel = supabase
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

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [setReports]);
}
