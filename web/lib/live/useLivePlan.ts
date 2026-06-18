'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Route, ImpactPrediction, SupplyManifest } from '@/lib/types/coordinator';
import { routeRowToUi, predictionRowToUi, manifestRowToUi } from './plan';
import type { RouteRow, PredictionRow, ManifestRow } from './plan';

export interface LivePlan {
  routes: Route[];
  predictions: Record<string, ImpactPrediction>;
  manifests: Record<string, SupplyManifest>;
}

// Initial fetch of the live pipeline output + a Realtime refetch whenever any of
// routes / impact_predictions / supply_manifests change. One subscription, debounced.
export function useLivePlan(): LivePlan {
  const [plan, setPlan] = useState<LivePlan>({ routes: [], predictions: {}, manifests: {} });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refetch = async () => {
      const [routes, preds, mans] = await Promise.all([
        supabase.from('coordinator_routes').select('*'),
        supabase.from('coordinator_impact_predictions').select('*'),
        supabase.from('coordinator_supply_manifests').select('*'),
      ]);
      if (cancelled) return;
      setPlan({
        routes: (routes.data ?? []).map((r) => routeRowToUi(r as unknown as RouteRow)),
        predictions: Object.fromEntries((preds.data ?? []).map((p) => {
          const ui = predictionRowToUi(p as unknown as PredictionRow); return [ui.barangayId, ui];
        })),
        manifests: Object.fromEntries((mans.data ?? []).map((m) => {
          const ui = manifestRowToUi(m as unknown as ManifestRow); return [ui.barangayId, ui];
        })),
      });
    };
    refetch();

    const channel = supabase
      .channel('live-plan')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'impact_predictions' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supply_manifests' }, refetch)
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  return plan;
}
