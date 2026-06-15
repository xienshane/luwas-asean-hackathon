'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { FieldReport } from '@/lib/types/coordinator';
import {
  dbReportToUi,
  mergeReport,
  type BarangayDirectoryEntry,
  type DbFieldReport,
} from './adapters';

// Feeds live field_reports into the dashboard's report state:
// initial fetch (last 100) + a realtime channel for INSERT/UPDATE.
// setReports is a useState setter — stable identity, safe in the dep array.
export function useLiveReports(
  setReports: React.Dispatch<React.SetStateAction<FieldReport[]>>,
) {
  useEffect(() => {
    const supabase = createClient();
    const directory = new Map<string, BarangayDirectoryEntry>();
    let cancelled = false;

    const applyRow = (row: DbFieldReport) => {
      const ui = dbReportToUi(row, directory);
      if (ui) setReports((prev) => mergeReport(prev, ui));
    };

    (async () => {
      const { data: dir } = await supabase
        .from('barangay_directory')
        .select('id, name, city_municipality, lat, lng, population');
      if (cancelled) return;
      (dir ?? []).forEach((d) => directory.set(d.id, d as BarangayDirectoryEntry));

      const { data: rows } = await supabase
        .from('field_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      (rows ?? []).reverse().forEach((row) => applyRow(row as DbFieldReport));
    })();

    const channel = supabase
      .channel('live-field-reports')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'field_reports' },
        (payload) => applyRow(payload.new as DbFieldReport),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'field_reports' },
        (payload) => applyRow(payload.new as DbFieldReport),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [setReports]);
}
