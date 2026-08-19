'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Route, ImpactPrediction, SupplyManifest } from '@/lib/types/coordinator';
import { routeRowToUi, predictionRowToUi, manifestRowToUi, depotStockFromRows } from './plan';
import type { RouteRow, PredictionRow, ManifestRow, DepotStockRow } from './plan';

export interface LivePlan {
  routes: Route[];
  predictions: Record<string, ImpactPrediction>;
  manifests: Record<string, SupplyManifest>;
  /** Force a refetch now — for actions that must show their result immediately (dispatch). */
  refresh: () => Promise<void>;
}

const EMPTY: Omit<LivePlan, 'refresh'> = { routes: [], predictions: {}, manifests: {} };

// Realtime is best-effort; poll on the same cadence as the reports feed as a safety net.
const POLL_MS = 20_000;

// Initial fetch of the live pipeline output + a Realtime refetch whenever any of
// routes / impact_predictions / supply_manifests change. One subscription, debounced.
export function useLivePlan(): LivePlan {
  const [plan, setPlan] = useState(EMPTY);
  // Set once the effect has built its fetcher; `refresh` stays stable for callers.
  const refetchRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refetch = async () => {
      const [routes, preds, mans, stockRows] = await Promise.all([
        supabase.from('coordinator_routes').select('*'),
        supabase.from('coordinator_impact_predictions').select('*'),
        supabase.from('coordinator_supply_manifests').select('*'),
        supabase.from('coordinator_depot_stock').select('*'),
      ]);
      if (cancelled) return;
      const stock = depotStockFromRows((stockRows.data ?? []) as unknown as DepotStockRow[]);
      setPlan({
        routes: (routes.data ?? []).map((r) => routeRowToUi(r as unknown as RouteRow)),
        predictions: Object.fromEntries((preds.data ?? []).map((p) => {
          const ui = predictionRowToUi(p as unknown as PredictionRow); return [ui.barangayId, ui];
        })),
        manifests: Object.fromEntries((mans.data ?? []).map((m) => {
          const ui = manifestRowToUi(m as unknown as ManifestRow, stock); return [ui.barangayId, ui];
        })),
      });
    };
    refetchRef.current = refetch;

    // Realtime evaluates RLS as the socket's own identity. routes / impact_predictions /
    // supply_manifests are all coordinator-only, so without the coordinator JWT on the socket
    // every change event is dropped and the map only moves on a page reload. Push the token
    // before subscribing and refresh it whenever the session changes.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const start = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      await refetch();
      if (cancelled) return;

      channel = supabase
        .channel('live-plan')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, refetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'impact_predictions' }, refetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'supply_manifests' }, refetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'facility_stock' }, refetch)
        .subscribe();
    };
    void start();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? '');
    });

    const pollId = setInterval(() => { void refetch(); }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      refetchRef.current = null;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const refresh = useCallback(async () => { await refetchRef.current?.(); }, []);

  return { ...plan, refresh };
}
