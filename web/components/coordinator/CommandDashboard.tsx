'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type {
  Barangay,
  FieldReport,
  Team,
  RoadEdge,
  Route,
  ImpactPrediction,
  SupplyManifest,
} from '@/lib/types/coordinator';
import { fetchCoordinatorMapData, fetchTeams, fetchRoadStatus, fetchFacilities } from '@/lib/supabase/coordinator';
import { createClient } from '@/lib/supabase/client';
import { useLivePlan } from '@/lib/live/useLivePlan';
import { useConnectivity } from '@/lib/live/connectivity';
import { useRealtimeHealth } from '@/lib/live/useRealtimeHealth';
import ConnectivityBanner from './ConnectivityBanner';
import type { LocationHub } from '@/lib/types/coordinator';
import LeftSidebar from './LeftSidebar';
import InteractiveCommandMap from './InteractiveCommandMap';
import BottomOperationsConsole from './BottomOperationsConsole';
import RightIntelligencePanel from './RightIntelligencePanel';
import RouteDetailPanel from './RouteDetailPanel';
import OperationsPanel from './OperationsPanel';
import ReportsView from './ReportsView';
import TeamsView from './TeamsView';
import ManifestsView from './ManifestsView';
import { useLiveReports } from '@/lib/live/useLiveReports';
import { useLiveVolunteers } from '@/lib/live/useLiveVolunteers';
import { roadBlockRequest, isLiveImpassableReport } from '@/lib/coordinator/roadStatus';
import { PAGASA_CATEGORY_LABELS, type LiveConditions } from '@/lib/live/conditions';
import DemoConsole from './DemoConsole';
import { capacityAlert } from '@/lib/coordinator/capacityAlert';
import { createSerialRunner } from '@/lib/coordinator/serialRunner';

interface CommandDashboardProps {
  /** Resolved on the server at request time so it cannot drift from /api/preflight. */
  demoConsole?: boolean;
}

export default function CommandDashboard({ demoConsole = false }: CommandDashboardProps) {
  const [currentView, setCurrentView] = useState('map');
  // Team to focus when arriving on the Teams & Dispatch tab (e.g. after clicking its route).
  const [focusTeamId, setFocusTeamId] = useState<string | null>(null);

  // Phase 6.1 — connectivity tier drives the degradation banner + action gating.
  const realtimeHealthy = useRealtimeHealth();
  const connectivity = useConnectivity({ realtimeHealthy });

  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const barangaysRef = useRef<Barangay[]>([]);
  useEffect(() => { barangaysRef.current = barangays; }, [barangays]);
  const [reports, setReports] = useState<FieldReport[]>([]);
  useLiveReports(setReports);
  const liveVolunteers = useLiveVolunteers();
  const [teams, setTeams] = useState<Team[]>([]);
  const [edges, setEdges] = useState<RoadEdge[]>([]);
  const [facilities, setFacilities] = useState<LocationHub[]>([]);

  const live = useLivePlan();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [dispatchPreview, setDispatchPreview] = useState<
    { teamId: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null
  >(null);

  // Drop the provisional hub->area line once the real pgRouting route for that team lands.
  useEffect(() => {
    if (dispatchPreview && routes.some((r) => r.teamId === dispatchPreview.teamId && r.status === 'active')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDispatchPreview(null);
    }
  }, [routes, dispatchPreview]);
  const [predictions, setPredictions] = useState<Record<string, ImpactPrediction>>({});
  const [manifests, setManifests] = useState<Record<string, SupplyManifest>>({});
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRoutes(live.routes); }, [live.routes]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPredictions(live.predictions); }, [live.predictions]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setManifests(live.manifests); }, [live.manifests]);

  const [selectedBarangay, setSelectedBarangay] = useState<Barangay | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);

  const [scores, setScores] = useState<{ barangayId: string; score: number; hoursSinceContact: number | null; timeFactor: number; popDensityNorm: number; hazardNorm: number }[]>([]);

  const [activityLogs, setActivityLogs] = useState<{ id: string; time: string; event: string; type: 'info' | 'warn' | 'success' | 'alert' }[]>([]);

  const [rerouteNotice, setRerouteNotice] = useState<string | null>(null);
  const mountedAtRef = useRef<number>(0);
  const reroutedReportsRef = useRef<Set<string>>(new Set());
  
  useEffect(() => { if (!mountedAtRef.current) mountedAtRef.current = Date.now(); }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCoordinatorMapData(), fetchTeams(), fetchRoadStatus(), fetchFacilities()])
      .then(([map, t, e, f]) => {
        if (cancelled) return;
        setBarangays(map.barangays);
        setScores(map.scores);
        setTeams(t);
        setEdges(e);
        setFacilities(f);
      })
      .catch((err) => {
        console.error('Failed to load live coordinator data from Supabase', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A3: Every pipeline action rescores server-side; the map only reflects it after a refetch.
  // Setters are stable, so this is safe to call from anywhere in the component.
  const refreshMap = async () => {
    try {
      const map = await fetchCoordinatorMapData();
      setBarangays(map.barangays);
      setScores(map.scores);
    } catch (err) {
      console.error('Failed to refresh coordinator map data', err);
      addActivityLog('MAP: scores could not be refreshed — showing the last known values.', 'warn');
    }
  };

  const translateRequested = useRef<Set<string>>(new Set());

  const addActivityLog = (event: string, type: 'info' | 'warn' | 'success' | 'alert' = 'info') => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivityLogs(prev => [
      { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, time: timeStr, event, type },
      ...prev
    ]);
  };

  // A4: Serial pipeline runner — collapses concurrent triggers into at most one re-run.
  // useMemo with [] creates this once on mount. barangaysRef.current is only accessed
  // inside the async task (called from event handlers), never synchronously during render.
  /* eslint-disable react-hooks/refs */
  const runPipeline = useMemo(
    () => createSerialRunner(async (barangayId: string | undefined) => {
      try {
        const res = await fetch('/api/pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(barangayId ? { barangayId } : {}),
        });
        // The route returns 500 with a named cause when a stage fails. Narrate that
        // cause — a route-save failure is not an AI outage, and saying so on stage
        // answers the wrong question.
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          addActivityLog(`PIPELINE: failed — ${detail?.error ?? `server responded ${res.status}`}.`, 'alert');
          return;
        }
        const out = await res.json();
        addActivityLog(
          `PIPELINE: ${out.predictions ?? 0} predictions, ${out.routes ?? 0} routes generated.`,
          'info',
        );
        if (out.note) addActivityLog(`PIPELINE: ${out.note}.`, 'warn');
        const capacity = capacityAlert(out.dropped, (id) =>
          barangaysRef.current.find((b) => b.id === id)?.name ?? id);
        if (capacity) addActivityLog(capacity, 'alert');
        await refreshMap();
      } catch (err) {
        // Only a genuine throw reaches here now — fetch rejected, i.e. no response.
        console.error('Pipeline run failed', err);
        addActivityLog('PIPELINE: failed to run (AI service unreachable).', 'alert');
      }
    }),
    // Deliberately empty: the serial runner must be created once, and refreshMap only
    // closes over stable setters, so the mount-time copy behaves like every later one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  /* eslint-enable react-hooks/refs */

  const handleSelectBarangay = (b: Barangay) => {
    setSelectedBarangay(b);
    setSelectedRoute(null);
    const matchingReport = reports.find(r => r.barangayId === b.id && r.status === 'pending');
    if (matchingReport) {
      setSelectedReport(matchingReport);
    } else {
      setSelectedReport(null);
    }
  };

  const handleSelectReport = (r: FieldReport) => {
    setSelectedReport(r);
    if (!r) return;
    if (!r.translatedText) translateReport(r.id);

    const byName = barangays.find(
      (b) => b.name.toLowerCase() === r.barangayName.trim().toLowerCase()
    );
    let resolved: Barangay | null = byName ?? null;
    if (!resolved && barangays.length > 0) {
      let best = Infinity;
      for (const b of barangays) {
        const d = (b.latitude - r.latitude) ** 2 + (b.longitude - r.longitude) ** 2;
        if (d < best) {
          best = d;
          resolved = b;
        }
      }
    }
    if (resolved) setSelectedBarangay(resolved);
  };

  // Update AI predictions and Sphere supply manifest overrides
  const handleSaveOverrides = async (
    barangayId: string,
    affectedOverride: number | null,
    suppliesOverride: { waterL?: number; foodPacks?: number; shelterKits?: number; blankets?: number; hygieneKits?: number; medicalSupplies?: number; shelterMaterials?: number } | null
  ) => {
    // 1. Update predictions local state override
    setPredictions(prev => {
      const current = prev[barangayId];
      if (!current) return prev;
      return {
        ...prev,
        [barangayId]: {
          ...current,
          overrideValue: affectedOverride
        }
      };
    });

    // 2. Update manifests local state overrides
    setManifests(prev => {
      const current = prev[barangayId];
      if (!current) return prev;
      
      const formattedOverrides = suppliesOverride ? {
        waterL: suppliesOverride.waterL,
        foodPacks: suppliesOverride.foodPacks,
        hygieneKits: suppliesOverride.hygieneKits,
        medicalSupplies: suppliesOverride.medicalSupplies,
        shelterMaterials: suppliesOverride.shelterMaterials,
        shelterKits: suppliesOverride.shelterKits,
        blankets: suppliesOverride.blankets
      } : undefined;

      return {
        ...prev,
        [barangayId]: {
          ...current,
          status: 'modified',
          overrides: formattedOverrides,
          overridden: !!suppliesOverride
        }
      };
    });

    // Log the override locally
    const bName = barangays.find(b => b.id === barangayId)?.name ?? 'Unknown Barangay';
    if (affectedOverride !== null) {
      addActivityLog(`COORDINATOR OVERRIDE: Modified TabPFN impact prediction for Barangay ${bName} to ${affectedOverride} affected people.`, 'warn');
    }
    if (suppliesOverride) {
      const details = [];
      if (suppliesOverride.waterL !== undefined) details.push(`Water: ${suppliesOverride.waterL}L`);
      if (suppliesOverride.foodPacks !== undefined) details.push(`Food: ${suppliesOverride.foodPacks} packs`);
      if (suppliesOverride.blankets !== undefined) details.push(`Blankets: ${suppliesOverride.blankets} pcs`);
      if (suppliesOverride.hygieneKits !== undefined) details.push(`Hygiene: ${suppliesOverride.hygieneKits} kits`);
      if (suppliesOverride.medicalSupplies !== undefined) details.push(`Medical: ${suppliesOverride.medicalSupplies} packs`);
      if (suppliesOverride.shelterMaterials !== undefined) details.push(`Shelter: ${suppliesOverride.shelterMaterials} units`);
      
      addActivityLog(`COORDINATOR OVERRIDE: Modified Sphere manifest for Barangay ${bName} (${details.join(', ')}).`, 'warn');
    }
    if (affectedOverride === null && !suppliesOverride) {
      addActivityLog(`COORDINATOR OVERRIDE: Cleared overrides for Barangay ${bName} to restore default predictions.`, 'info');
    }

    // Persist overrides to Supabase
    try {
      const supabase = createClient();
      
      // Update or upsert impact_predictions override
      const { error: predError } = await supabase
        .from('impact_predictions')
        .upsert(
          { barangay_id: barangayId, override_value: affectedOverride },
          { onConflict: 'barangay_id' }
        );
      if (predError) {
        console.error('Failed to save impact override:', predError);
        addActivityLog(`OVERRIDE ERROR: Failed to save impact override.`, 'alert');
      }

      // Update or upsert supply_manifests override
      if (suppliesOverride) {
        const { data: existing } = await supabase
          .from('supply_manifests')
          .select('*')
          .eq('barangay_id', barangayId)
          .maybeSingle();

        const days = existing?.days ?? 3;
        const access_modifier = Number(existing?.access_modifier ?? 1.0);
        type ManifestLine = {
          item?: string; category?: string; quantity?: number; weight_kg?: number;
          unit?: string; unit_weight_kg?: number; basis?: string; inputs?: unknown;
        };
        const breakdown: { lines: ManifestLine[]; total_weight_kg?: number } =
          existing?.breakdown || { lines: [] };

        if (!breakdown.lines || breakdown.lines.length === 0) {
          breakdown.lines = [];
        }

        // Helper to cleanly find and update, or push a newly structured manifest line
        const updateOrAddLine = (category: string, itemDefaultName: string, quantity: number, unit: string, unitWeight: number) => {
          const idx = breakdown.lines.findIndex((line) =>
            line.category === category || line.item?.toLowerCase().includes(itemDefaultName.toLowerCase())
          );
          const newLine = {
            item: itemDefaultName,
            category,
            unit,
            quantity,
            unit_weight_kg: unitWeight,
            weight_kg: quantity * unitWeight,
            basis: 'Coordinator override',
            inputs: {}
          };
          if (idx >= 0) {
            breakdown.lines[idx] = { ...breakdown.lines[idx], ...newLine };
          } else {
            breakdown.lines.push(newLine);
          }
        };

        if (suppliesOverride.waterL !== undefined) {
          updateOrAddLine('water', 'Drinking water', suppliesOverride.waterL, 'L', 1.0);
        }
        if (suppliesOverride.foodPacks !== undefined) {
          updateOrAddLine('food', 'Food packs', suppliesOverride.foodPacks, 'packs', 0.6);
        }
        const shelterQty = suppliesOverride.shelterMaterials !== undefined ? suppliesOverride.shelterMaterials : suppliesOverride.shelterKits;
        if (shelterQty !== undefined) {
          updateOrAddLine('shelter', 'Tarpaulins / Shelter kits', shelterQty, 'units', 5.0);
        }
        if (suppliesOverride.blankets !== undefined) {
          updateOrAddLine('blankets', 'Blankets', suppliesOverride.blankets, 'pcs', 1.5);
        }
        if (suppliesOverride.hygieneKits !== undefined) {
          updateOrAddLine('hygiene', 'Hygiene kits', suppliesOverride.hygieneKits, 'kits', 3.0);
        }
        if (suppliesOverride.medicalSupplies !== undefined) {
          updateOrAddLine('medical', 'Medical supplies', suppliesOverride.medicalSupplies, 'packs', 2.0);
        }

        breakdown.total_weight_kg = breakdown.lines.reduce((sum: number, l) => sum + (l.weight_kg || 0), 0);

        const water_l = suppliesOverride.waterL !== undefined ? suppliesOverride.waterL : (existing?.water_l ?? 0);
        const food_packs = suppliesOverride.foodPacks !== undefined ? suppliesOverride.foodPacks : (existing?.food_packs ?? 0);
        const shelter_kits = shelterQty !== undefined ? shelterQty : (existing?.shelter_kits ?? 0);
        const blankets = suppliesOverride.blankets !== undefined ? suppliesOverride.blankets : (existing?.blankets ?? 0);

        const { error: manifestError } = await supabase
          .from('supply_manifests')
          .upsert({
            barangay_id: barangayId,
            days,
            access_modifier,
            water_l,
            food_packs,
            shelter_kits,
            blankets,
            breakdown,
            overridden: true
          }, { onConflict: 'barangay_id' });

        if (manifestError) {
          console.error('Failed to save manifest override:', manifestError);
          addActivityLog(`OVERRIDE ERROR: Failed to save manifest override.`, 'alert');
        }
      } else {
        const { error: manifestError } = await supabase
          .from('supply_manifests')
          .update({ overridden: false })
          .eq('barangay_id', barangayId);

        if (manifestError) {
          console.error('Failed to clear manifest override:', manifestError);
        }
      }

      // Make the panel and rail agree with what was just written. The stored score
      // only moves when silent_area_score() next runs, so this does not repaint the
      // pin — deliberately no rescore RPC here; that is a pipeline concern and it
      // would slow the override the coordinator is watching.
      await refreshMap();

      // Re-run pipeline to propagate parameters downstream
      addActivityLog(`PIPELINE: Recalculating routes with overridden values…`, 'info');
      await runPipeline(barangayId);
    } catch (err) {
      console.error('Failed to save override or run pipeline:', err);
      addActivityLog('PIPELINE: failed to run downstream (AI service unreachable).', 'alert');
    }
  };

  const translateReport = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report || report.translatedText || translateRequested.current.has(reportId)) return;
    translateRequested.current.add(reportId);
    try {
      const tr = await fetch('/api/translate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      });
      const { translated_text, provider } = await tr.json();
      if (provider === 'gemini') {
        addActivityLog(`NLP: SEA-LION unavailable — used Gemini fallback for ${report.barangayName}.`, 'warn');
      }
      if (translated_text) {
        setReports(prev => prev.map(r => r.id === reportId ? { ...r, translatedText: translated_text } : r));
        setSelectedReport(prev => prev && prev.id === reportId ? { ...prev, translatedText: translated_text } : prev);
      }
    } catch {
      translateRequested.current.delete(reportId);
      addActivityLog(`TRANSLATION: unavailable for ${report.barangayName}.`, 'warn');
    }
  };

  // A4: Marks reports confirmed (DB + local state) without running the pipeline.
  // A bulk action marks N then triggers one run.
  const markReportsConfirmed = async (reportIds: string[]): Promise<boolean> => {
    const targets = reports.filter(r => reportIds.includes(r.id));
    if (targets.length === 0) return false;
    const stamp = new Date().toISOString();
    const ids = targets.map(r => r.id);
    const barangayIds = new Set(targets.map(r => r.barangayId).filter(Boolean) as string[]);

    setReports(prev => prev.map(r => (ids.includes(r.id) ? { ...r, status: 'confirmed' } : r)));
    setBarangays(prev => prev.map(b =>
      barangayIds.has(b.id) ? { ...b, lastConfirmedContact: stamp } : b));
    setSelectedBarangay(prev =>
      prev && barangayIds.has(prev.id) ? { ...prev, lastConfirmedContact: stamp } : prev);

    const supabase = createClient();
    const { error } = await supabase.from('field_reports').update({ status: 'confirmed' }).in('id', ids);
    if (error) {
      setReports(prev => prev.map(r => {
        const original = targets.find(t => t.id === r.id);
        return original ? original : r;
      }));
      addActivityLog(`REPORT CONFIRM FAILED: ${error.message}. Nothing was confirmed; try again.`, 'alert');
      return false;
    }

    targets.forEach(r => void translateReport(r.id));
    addActivityLog(
      targets.length === 1
        ? `REPORT CONFIRMED: ${targets[0].barangayName}. Running pipeline…`
        : `REPORTS CONFIRMED: ${targets.length} reports. Running one pipeline…`,
      'success',
    );
    return true;
  };

  const handleConfirmReport = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    if (await markReportsConfirmed([reportId])) {
      await runPipeline(report.barangayId ?? undefined);
    }
  };

  const handleConfirmReports = async (reportIds: string[]) => {
    if (await markReportsConfirmed(reportIds)) {
      await runPipeline(undefined); // one whole-region run covers every confirmed barangay
    }
  };

  const handleFlagReport = async (reportId: string) => {
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'flagged' } : r));
    setSelectedReport(null);
    const supabase = createClient();
    await supabase.from('field_reports').update({ status: 'flagged' }).eq('id', reportId);
    addActivityLog(`REPORT FLAGGED: #${reportId} flagged as unreliable.`, 'warn');
  };

  const runReroute = async (reasonLabel: string) => {
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // B4ui: Predictions and manifests are already persisted; this beat only redraws routes.
        // W2's B4 turns this into the fast path — until then the route ignores the key.
        body: JSON.stringify({ mode: 'reroute' }),
      });
      const out = await res.json().catch(() => ({}));
      // The graph edit landed regardless, so still repaint the roads — but a 500
      // means nothing was redrawn, and announcing a redraw that did not happen is
      // the exact failure W2's A5 was built to surface.
      try { setEdges(await fetchRoadStatus()); } catch { /* best-effort */ }
      if (!res.ok) {
        addActivityLog(
          `RE-ROUTE: failed — ${out.error ?? `server responded ${res.status}`}. Graph updated, routes not redrawn.`,
          'alert',
        );
        return;
      }
      setRerouteNotice(`Re-routed: ${reasonLabel}`);
      addActivityLog(`RE-ROUTE: ${reasonLabel} — ${out.routes ?? 0} route(s) redrawn on real roads.`, 'warn');
      // The fast path returns 200 with a note when it legitimately did nothing
      // ("no stored manifests"). Without this the only reason is on the floor.
      if (out.note) addActivityLog(`RE-ROUTE: ${out.note}.`, 'warn');
      const capLine = capacityAlert(out.dropped, (id) => barangaysRef.current.find(b => b.id === id)?.name ?? id);
      if (capLine) addActivityLog(capLine, 'alert');
      await refreshMap();
      window.setTimeout(() => setRerouteNotice(null), 8000);
    } catch {
      addActivityLog('RE-ROUTE: pipeline unreachable — graph updated, routes not redrawn.', 'alert');
    }
  };

  const handleUpdateRoadStatus = async (edgeId: string, status: 'open' | 'slow' | 'blocked' | 'damaged', notes?: string) => {
    const edgeName = edges.find(e => e.id === edgeId)?.name ?? `Edge ${edgeId}`;
    setEdges(prev => prev.map(e => e.id === edgeId ? { ...e, status, notes } : e));

    const req = roadBlockRequest(status, notes);
    if (!req) {
      addActivityLog(`ROAD NETWORK: ${edgeName} marked [SLOW] (advisory — graph unchanged).`, 'warn');
      return;
    }
    addActivityLog(`ROAD NETWORK: ${edgeName} status [${status.toUpperCase()}] — updating road graph…`, req.impassable ? 'warn' : 'info');
    try {
      const res = await fetch('/api/road-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edgeId: Number(edgeId), ...req }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `road-status ${res.status}`);
      }
      await runReroute(req.impassable
        ? `road reported impassable — ${edgeName}`
        : `road cleared — ${edgeName}`);
    } catch (err) {
      addActivityLog(`ROAD NETWORK: update failed — ${err instanceof Error ? err.message : 'unknown error'}.`, 'alert');
    }
  };

  const handleBlockRoadAt = async (lat: number, lng: number) => {
    addActivityLog('ROAD NETWORK: blocking nearest road to the clicked point…', 'warn');
    try {
      const res = await fetch('/api/road-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, impassable: true, reason: 'coordinator block (map)' }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `road-status ${res.status}`);
      }
      const out = await res.json().catch(() => ({}));
      await runReroute(`road blocked by coordinator (edge ${out.edgeId ?? '?'})`);
    } catch (err) {
      addActivityLog(`ROAD NETWORK: block failed — ${err instanceof Error ? err.message : 'unknown error'}.`, 'alert');
    }
  };

  useEffect(() => {
    const fresh = reports.filter(
      (r) => isLiveImpassableReport(r, mountedAtRef.current) && !reroutedReportsRef.current.has(r.id),
    );
    if (fresh.length === 0) return;
    fresh.forEach((r) => reroutedReportsRef.current.add(r.id));
    const where = fresh[0].barangayName || 'a field report';
    void runReroute(`road reported impassable by volunteer (${where})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  const handleUpdateManifestStatus = async (
    barangayId: string,
    status: 'approved' | 'modified' | 'rejected',
  ) => {
    const previous = manifests[barangayId]?.status ?? 'pending';
    setManifests(prev => {
      const current = prev[barangayId];
      if (!current) return prev;
      return { ...prev, [barangayId]: { ...current, status } };
    });

    const bName = barangays.find(b => b.id === barangayId)?.name;
    const supabase = createClient();
    const { error } = await supabase
      .from('supply_manifests')
      .update({ status })
      .eq('barangay_id', barangayId);

    if (error) {
      setManifests(prev => {
        const current = prev[barangayId];
        if (!current) return prev;
        return { ...prev, [barangayId]: { ...current, status: previous } };
      });
      addActivityLog(
        `SUPPLY PLANNING: could not save the review for ${bName} — ${error.message}. Status left at ${previous}; try again.`,
        'alert',
      );
      return;
    }

    addActivityLog(
      `SUPPLY PLANNING: Relief manifest for ${bName} was [${status.toUpperCase()}] by coordinator.`,
      status === 'approved' ? 'success' : 'alert',
    );
  };

  // Route-click opens an in-rail Route/Convoy detail (keeps the map in view) instead of jumping
  // to the Teams view. Route wins the rail: selecting a route clears any barangay selection.
  const handleSelectRoute = (route: Route) => {
    setSelectedRoute(route);
    setSelectedBarangay(null);
  };

  // "View in Teams" preserves the old behavior as a secondary action.
  const handleViewRouteInTeams = () => {
    if (selectedRoute) setFocusTeamId(selectedRoute.teamId || null);
    setSelectedRoute(null);
    setCurrentView('teams');
  };

  const handleDispatchTeam = async (teamId: string, barangayId: string) => {
    const previousTeam = teams.find(t => t.id === teamId);
    const tName = previousTeam?.name;
    const brgy = barangays.find(b => b.id === barangayId);

    setTeams(prev => prev.map(t => t.id === teamId
      ? { ...t, status: 'dispatched', currentAssignment: `Relief Delivery to ${brgy?.name}` } : t));

    // Instant provisional hub->area line while the real road route is computed.
    const hub = facilities[0];
    if (hub && brgy) {
      setDispatchPreview({ teamId, from: { lat: hub.latitude, lng: hub.longitude }, to: { lat: brgy.latitude, lng: brgy.longitude } });
    }
    addActivityLog(`TEAM DISPATCH: Deployed ${tName} to ${brgy?.name} with humanitarian cargo.`, 'success');

    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, barangayId }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `dispatch ${res.status}`);
      }
      addActivityLog(`ROUTING: real-road route generated for ${tName} → ${brgy?.name}.`, 'info');
    } catch (err) {
      // A6: Nothing was written — the optimistic dispatch must not survive as a phantom convoy.
      setDispatchPreview(null);
      if (previousTeam) setTeams(prev => prev.map(t => (t.id === teamId ? previousTeam : t)));
      addActivityLog(
        `ROUTING: dispatch failed — ${err instanceof Error ? err.message : 'service unreachable'}. ${tName} is not dispatched; retry when the service is back.`,
        'alert',
      );
    }
  };

  const handleMarkReached = async (routeId: string) => {
    const previousRoute = routes.find(r => r.id === routeId);
    const previousTeam = previousRoute?.teamId
      ? teams.find(t => t.id === previousRoute.teamId)
      : undefined;
    const bName = previousRoute?.stops?.[0]?.barangayName ?? 'area';

    setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, status: 'completed' } : r));
    if (previousRoute?.teamId) {
      setTeams(prev => prev.map(t => t.id === previousRoute.teamId
        ? { ...t, status: 'active', currentAssignment: undefined } : t));
    }
    addActivityLog(`AREA REACHED: ${bName} marked reached. Route completed; contact updated.`, 'success');

    try {
      const res = await fetch('/api/routes/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routeId }),
      });
      if (!res.ok) throw new Error(`complete ${res.status}`);
      await refreshMap();
    } catch (err) {
      if (previousRoute) setRoutes(prev => prev.map(r => (r.id === routeId ? previousRoute : r)));
      if (previousTeam) setTeams(prev => prev.map(t => (t.id === previousTeam.id ? previousTeam : t)));
      addActivityLog(
        `AREA REACHED: not recorded — ${err instanceof Error ? err.message : 'service unreachable'}. ${bName} is still en route; mark it again once the service is back.`,
        'alert',
      );
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Bumped on every reset. Keying ManifestsView on it forces a remount, so its
  // in-memory approve/reject history goes with the localStorage key below —
  // clearing storage alone would leave a mounted view still showing the old run.
  const [resetEpoch, setResetEpoch] = useState(0);
  const handleReset = () => setShowResetConfirm(true);

  const confirmReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(`reset ${res.status}: ${detail?.error ?? 'unknown'}`);
      }
      setReports([]);
      setRoutes([]);
      setPredictions({});
      setManifests({});
      setSelectedReport(null);
      setSelectedBarangay(null);
      // Ghosts of the previous run. Each one survives a truncate because it lives
      // outside the tables /api/reset clears.
      setDispatchPreview(null);      // the effect that clears it needs a matching
                                     // active route, and routes are now empty
      setRerouteNotice(null);
      reroutedReportsRef.current.clear();
      try {
        localStorage.removeItem('manifest-history');
      } catch {
        /* private mode / storage disabled — nothing to clear */
      }
      setResetEpoch((n) => n + 1);
      // Teams carry client-only dispatch status (/api/dispatch never writes to
      // `teams`), so the rail keeps reading "dispatched" until we refetch.
      const [map, t, e] = await Promise.all([fetchCoordinatorMapData(), fetchTeams(), fetchRoadStatus()]);
      setBarangays(map.barangays);
      setScores(map.scores);
      setTeams(t);
      setEdges(e);
      addActivityLog('OPERATIONS: Cleared all reports and generated plans. Accounts and base data kept.', 'alert');
    } catch (err) {
      addActivityLog(`OPERATIONS: Reset failed — ${err instanceof Error ? err.message : 'unknown error'}.`, 'alert');
    } finally {
      setResetting(false);
      setShowResetConfirm(false);
    }
  };

  const [showDay0Modal, setShowDay0Modal] = useState(false);
  const [day0Running, setDay0Running] = useState(false);
  const [day0Category, setDay0Category] = useState(4); // PAGASA intensity; 4 = super typhoon

  // Phase 4.7 — live storm signal for the Day-0 scenario. Assistive: it pre-fills the
  // category picker (still coordinator-override-able); a down feed leaves the manual pick.
  const [liveConditions, setLiveConditions] = useState<LiveConditions | null>(null);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'unavailable'>('idle');

  const fetchLiveConditions = async (): Promise<LiveConditions | null> => {
    setLiveStatus('loading');
    try {
      const res = await fetch('/api/live-conditions');
      const out = await res.json();
      if (out?.available && out.conditions) {
        setLiveConditions(out.conditions as LiveConditions);
        setLiveStatus('idle');
        return out.conditions as LiveConditions;
      }
    } catch { /* fall through to unavailable */ }
    setLiveConditions(null);
    setLiveStatus('unavailable');
    return null;
  };

  const handleRunDay0 = () => {
    setShowDay0Modal(true);
    void fetchLiveConditions(); // pre-load the live reading; never blocks opening the modal
  };

  const confirmDay0 = async () => {
    setDay0Running(true);
    addActivityLog(`ANTICIPATORY PLAN: running ${PAGASA_CATEGORY_LABELS[day0Category]} scenario...`, 'info');
    try {
      const res = await fetch('/api/pipeline/day0', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryOrdinal: day0Category }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(`day0 ${res.status}: ${detail?.error ?? 'unknown'}`);
      }
      const out = await res.json();
      addActivityLog(
        `ANTICIPATORY PLAN: ${out.predictions ?? 0} predictions, ${out.manifests ?? 0} manifests (${out.source ?? 'model'}).`,
        'success',
      );
      // The whole beat is watching the map change. Predictions feed impact_frac →
      // score server-side; without this the pins hold pre-run values until a reload.
      await refreshMap();
    } catch (err) {
      addActivityLog(`ANTICIPATORY PLAN: failed — ${err instanceof Error ? err.message : 'AI service unreachable'}.`, 'alert');
    } finally {
      setDay0Running(false);
      setShowDay0Modal(false);
    }
  };

  const handleClearBarangaySelection = () => {
    setSelectedBarangay(null);
    setSelectedReport(null);
  };

  const reportsCount = reports.filter(r => r.status === 'pending').length;
  const highPriorityCount = scores.filter(s => s.score >= 0.5).length;
  const [consoleHeight, setConsoleHeight] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = React.useRef(0);
  const startHeightRef = React.useRef(240);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = consoleHeight;
  };

  React.useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = startYRef.current - e.clientY;
      const newHeight = Math.max(120, startHeightRef.current + delta);
      setConsoleHeight(newHeight);
    };
    const onMouseUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing]);

  const ResizeHandle = () => (
    <div className="h-2 cursor-ns-resize bg-line" onMouseDown={handleMouseDown} />
  );

  return (
    <div className="flex h-screen w-screen bg-bg text-fg font-sans overflow-hidden">
      <ConnectivityBanner tier={connectivity} />
      {demoConsole && <DemoConsole onLog={addActivityLog} />}
      {/* E2E hook (Phase 5.2): deterministic "map data + scores loaded" signal,
          so tests never depend on the MapLibre canvas. Renders nothing. */}
      <div
        data-testid="dashboard-stats"
        data-barangays={barangays.length}
        data-scores={scores.length}
        data-high-priority={highPriorityCount}
        hidden
      />
      {/* Left Sidebar */}
      <LeftSidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        reportsCount={reportsCount}
        highPriorityCount={highPriorityCount}
        onReset={handleReset}
        onRunDay0={handleRunDay0}
        day0Running={day0Running}
        online={connectivity !== 'offline'}
      />

      {/* Main workspace */}
      <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
        {/* VIEW: Live Map */}
        <div className={`flex-1 min-w-0 min-h-0 ${currentView === 'map' ? 'flex' : 'hidden'}`}>
          <div className="flex-1 flex flex-col min-w-0">
            <div className="relative flex-1 min-h-0 p-4">
              {rerouteNotice && (
                <div
                  role="status"
                  className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-control border border-warning/40 bg-warning/15 px-4 py-2 text-sm font-semibold text-warning shadow-overlay"
                >
                  ⟲ {rerouteNotice}
                </div>
              )}
              <InteractiveCommandMap
                active={currentView === 'map'}
                barangays={barangays}
                reports={reports}
                teams={teams}
                edges={edges}
                routes={routes}
                facilities={facilities}
                dispatchPreview={dispatchPreview}
                volunteers={liveVolunteers}
                selectedBarangay={selectedBarangay}
                onSelectBarangay={handleSelectBarangay}
                selectedReport={selectedReport}
                onSelectReport={handleSelectReport}
                onSelectRoute={handleSelectRoute}
                scores={scores}
                onUpdateRoadStatus={handleUpdateRoadStatus}
                onBlockRoadAt={handleBlockRoadAt}
                onConfirmReport={handleConfirmReport}
                onFlagReport={handleFlagReport}
              />
            </div>
            <BottomOperationsConsole activityLogs={activityLogs} />
          </div>
          {selectedRoute && routes.some((r) => r.id === selectedRoute.id) ? (
            <RouteDetailPanel
              route={routes.find((r) => r.id === selectedRoute.id)!}
              team={teams.find((t) => t.id === selectedRoute.teamId)}
              onMarkReached={(id) => { handleMarkReached(id); setSelectedRoute(null); }}
              onViewInTeams={handleViewRouteInTeams}
              onClose={() => setSelectedRoute(null)}
            />
          ) : selectedBarangay ? (
            <RightIntelligencePanel
              selectedBarangay={selectedBarangay}
              barangays={barangays}
              reportsCount={reportsCount}
              scores={scores}
              prediction={predictions[selectedBarangay.id]}
              manifest={manifests[selectedBarangay.id]}
              facilities={facilities}
              teams={teams}
              routes={routes}
              onSaveOverrides={handleSaveOverrides}
              onUpdateManifestStatus={handleUpdateManifestStatus}
              onDispatchTeam={handleDispatchTeam}
              onMarkReached={handleMarkReached}
              onClearBarangaySelection={handleClearBarangaySelection}
            />
          ) : (
            <OperationsPanel
              reports={reports}
              routes={routes}
              manifests={manifests}
              barangays={barangays}
              scores={scores}
              onSelectReport={handleSelectReport}
              onConfirmReport={handleConfirmReport}
              onFlagReport={handleFlagReport}
              onViewChange={setCurrentView}
            />
          )}
        </div>

        {/* VIEW: Field Reports */}
        {currentView === 'reports' && (
          <ReportsView
            reports={reports}
            onFlagReport={handleFlagReport}
            onConfirmReport={handleConfirmReport}
            onConfirmReports={handleConfirmReports}
            onTranslateReport={translateReport}
          />
        )}

        {/* VIEW: Teams & Dispatch */}
        {currentView === 'teams' && (
          <TeamsView
            teams={teams}
            routes={routes}
            barangays={barangays}
            onDispatchTeam={handleDispatchTeam}
            focusTeamId={focusTeamId}
          />
        )}

        {/* VIEW: Supply Manifests */}
        {currentView === 'manifests' && (
          <ManifestsView
            key={resetEpoch}
            barangays={barangays}
            manifests={manifests}
            predictions={predictions}
            onUpdateManifestStatus={handleUpdateManifestStatus}
          />
        )}
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-line rounded-card shadow-modal max-w-md w-full mx-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h3 className="text-[15px] font-medium text-fg">Reset to scratch</h3>
              <p className="text-[13px] text-muted mt-1">This cannot be undone.</p>
            </div>
            <div className="px-4 py-3 text-[14px] text-muted">
              Clears all reports and generated plans (predictions, manifests, routes, volunteer
              positions) and un-blocks every road. Accounts and base map data are kept.
            </div>
            <div className="px-4 py-3 border-t border-line flex gap-2 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="px-4 py-2 text-[13px] text-muted hover:text-fg border border-line rounded-control transition-colors duration-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                disabled={resetting}
                className="px-4 py-2 text-[13px] font-medium text-critical bg-critical/10 hover:bg-critical/20 border border-critical/30 rounded-control transition-colors duration-100 cursor-pointer disabled:opacity-50"
              >
                {resetting ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day-0 forecast */}
      {showDay0Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-line rounded-card shadow-modal max-w-md w-full mx-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h3 className="text-[15px] font-medium text-fg">Anticipatory plan</h3>
              <p className="text-[13px] text-muted mt-1">
                Forecast impact across communities before any field report arrives.
              </p>
            </div>
            <div className="px-4 py-3 space-y-3">
              <label className="block text-[13px] text-muted">Storm scenario (PAGASA intensity)</label>
              <select
                value={day0Category}
                onChange={(e) => setDay0Category(Number(e.target.value))}
                disabled={day0Running}
                className="w-full px-3 py-2 text-[14px] text-fg bg-raised border border-line-strong rounded-control cursor-pointer disabled:opacity-50"
              >
                {PAGASA_CATEGORY_LABELS.map((label, i) => (
                  <option key={i} value={i}>{`Cat ${i} — ${label}`}</option>
                ))}
              </select>
              {/* Phase 4.7 — live environmental signal (assistive; overrides the manual pick) */}
              <div className="rounded-control border border-line bg-raised px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-muted">Live conditions (Open-Meteo, worst across Cebu)</span>
                  <button
                    type="button"
                    onClick={() => void fetchLiveConditions()}
                    disabled={day0Running || liveStatus === 'loading'}
                    className="text-[11px] text-muted hover:text-fg underline disabled:opacity-50 cursor-pointer"
                  >
                    {liveStatus === 'loading' ? 'Fetching…' : 'Refresh'}
                  </button>
                </div>
                {liveConditions ? (
                  <div className="mt-1.5 space-y-1">
                    <div className="text-[13px] text-fg">
                      {Math.round(liveConditions.wind_kmh)} km/h wind
                      {liveConditions.gust_kmh != null && <span className="text-muted"> · gusts {Math.round(liveConditions.gust_kmh)}</span>}
                      {liveConditions.precip_mm != null && <span className="text-muted"> · rain {liveConditions.precip_mm} mm</span>}
                    </div>
                    <div className="text-[12px] text-muted">
                      → Cat {liveConditions.category_ordinal} ({liveConditions.category_label})
                      {liveConditions.stale && <span className="text-warning"> · cached (feed unreachable)</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDay0Category(liveConditions.category_ordinal)}
                      disabled={day0Running || day0Category === liveConditions.category_ordinal}
                      className="mt-1 px-2.5 py-1 text-[12px] text-active bg-active/10 hover:bg-active/20 border border-active/30 rounded-control disabled:opacity-50 cursor-pointer"
                    >
                      {day0Category === liveConditions.category_ordinal ? 'Live category applied' : 'Apply live category'}
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-[12px] text-muted">
                    {liveStatus === 'loading'
                      ? 'Fetching current conditions…'
                      : 'Live feed unavailable — using the manual scenario above.'}
                  </p>
                )}
              </div>
              <p className="text-[12px] text-muted leading-relaxed">
                Runs TabPFN over static vulnerability features for the chosen storm category, then
                builds Sphere manifests. The hazard signal is a single uniform category, so estimates are scenario-based. Results appear as
                <span className="text-fg"> Anticipatory — unconfirmed</span> and stay override-able;
                nothing is dispatched.
              </p>
            </div>
            <div className="px-4 py-3 border-t border-line flex gap-2 justify-end">
              <button
                onClick={() => setShowDay0Modal(false)}
                disabled={day0Running}
                className="px-4 py-2 text-[13px] text-muted hover:text-fg border border-line rounded-control transition-colors duration-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDay0}
                disabled={day0Running}
                className="px-4 py-2 text-[13px] font-medium text-bg bg-active hover:brightness-110 rounded-control transition-colors duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {day0Running ? 'Forecasting…' : 'Run anticipatory plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 