'use client';

import React, { useState, useEffect, useRef } from 'react';
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

export default function CommandDashboard() {
  const [currentView, setCurrentView] = useState('map');
  // Team to focus when arriving on the Teams & Dispatch tab (e.g. after clicking its route).
  const [focusTeamId, setFocusTeamId] = useState<string | null>(null);

  // Phase 6.1 — connectivity tier drives the degradation banner + action gating.
  const realtimeHealthy = useRealtimeHealth();
  const connectivity = useConnectivity({ realtimeHealthy });

  const [barangays, setBarangays] = useState<Barangay[]>([]);
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
      setDispatchPreview(null);
    }
  }, [routes, dispatchPreview]);
  const [predictions, setPredictions] = useState<Record<string, ImpactPrediction>>({});
  const [manifests, setManifests] = useState<Record<string, SupplyManifest>>({});
  useEffect(() => { setRoutes(live.routes); }, [live.routes]);
  useEffect(() => { setPredictions(live.predictions); }, [live.predictions]);
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

      // Re-run pipeline to propagate parameters downstream
      addActivityLog(`PIPELINE: Recalculating routes with overridden values…`, 'info');
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barangayId }),
      });
      if (!res.ok) {
        throw new Error(`pipeline responded ${res.status}`);
      }
      const out = await res.json();
      addActivityLog(`PIPELINE: Overrides propagated. Generated ${out.predictions ?? 0} predictions, ${out.routes ?? 0} routes.`, 'success');
    } catch (err) {
      console.error('Failed to save override or run pipeline:', err);
      addActivityLog('PIPELINE: failed to run downstream (AI service unreachable).', 'alert');
    }
  };

  const translateRequested = useRef<Set<string>>(new Set());
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

  const handleConfirmReport = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;

    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'confirmed' } : r));
    if (report.barangayId) {
      setBarangays(prev => prev.map(b =>
        b.id === report.barangayId ? { ...b, lastConfirmedContact: new Date().toISOString() } : b
      ));
      const updatedB = barangays.find(b => b.id === report.barangayId);
      if (updatedB) {
        setSelectedBarangay({ ...updatedB, lastConfirmedContact: new Date().toISOString() });
      }
    }

    const supabase = createClient();
    await supabase.from('field_reports').update({ status: 'confirmed' }).eq('id', reportId);
    addActivityLog(`REPORT CONFIRMED: ${report.barangayName}. Running pipeline…`, 'success');

    await translateReport(reportId);

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barangayId: report.barangayId }),
      });
      const out = await res.json();
      addActivityLog(`PIPELINE: ${out.predictions ?? 0} predictions, ${out.routes ?? 0} routes generated.`, 'info');
    } catch {
      addActivityLog('PIPELINE: failed to run (AI service unreachable).', 'alert');
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const out = await res.json().catch(() => ({}));
      try { setEdges(await fetchRoadStatus()); } catch { /* best-effort */ }
      setRerouteNotice(`Re-routed: ${reasonLabel}`);
      addActivityLog(`RE-ROUTE: ${reasonLabel} — ${out.routes ?? 0} route(s) redrawn on real roads.`, 'warn');
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

  const handleUpdateManifestStatus = (barangayId: string, status: 'approved' | 'modified' | 'rejected') => {
    setManifests(prev => {
      const current = prev[barangayId];
      if (!current) return prev;
      return {
        ...prev,
        [barangayId]: {
          ...current,
          status
        }
      };
    });

    const bName = barangays.find(b => b.id === barangayId)?.name;
    addActivityLog(`SUPPLY PLANNING: Relief manifest for ${bName} was [${status.toUpperCase()}] by coordinator.`, status === 'approved' ? 'success' : 'alert');
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
    const tName = teams.find(t => t.id === teamId)?.name;
    const brgy = barangays.find(b => b.id === barangayId);

    setTeams(prev => prev.map(t => t.id === teamId
      ? { ...t, status: 'dispatched', currentAssignment: `Relief Delivery to ${brgy?.name}` } : t));

    // Instant provisional hub->area line while the real road route is computed. dispatch_route
    // uses the authoritative depot server-side; the client preview uses the loaded hub.
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
      setDispatchPreview(null);
      addActivityLog(`ROUTING: route generation failed — ${err instanceof Error ? err.message : 'service unreachable'}.`, 'alert');
    }
  };

  const handleMarkReached = async (routeId: string) => {
    const route = routes.find(r => r.id === routeId);
    const bName = route?.stops?.[0]?.barangayName ?? 'area';
    setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, status: 'completed' } : r));
    if (route?.teamId) setTeams(prev => prev.map(t => t.id === route.teamId ? { ...t, status: 'active', currentAssignment: undefined } : t));
    addActivityLog(`AREA REACHED: ${bName} marked reached. Route completed; contact updated.`, 'success');
    try {
      const res = await fetch('/api/routes/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routeId }),
      });
      if (!res.ok) throw new Error(`complete ${res.status}`);
      const map = await fetchCoordinatorMapData();
      setBarangays(map.barangays);
      setScores(map.scores);
    } catch (err) {
      addActivityLog(`AREA REACHED: failed to persist — ${err instanceof Error ? err.message : 'service unreachable'}.`, 'alert');
    }
  };

  const addActivityLog = (event: string, type: 'info' | 'warn' | 'success' | 'alert' = 'info') => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivityLogs(prev => [
      { id: `log-${Date.now()}`, time: timeStr, event, type },
      ...prev
    ]);
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
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
      const [map, e] = await Promise.all([fetchCoordinatorMapData(), fetchRoadStatus()]);
      setBarangays(map.barangays);
      setScores(map.scores);
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
    addActivityLog(`DAY 0 FORECAST: running ${PAGASA_CATEGORY_LABELS[day0Category]} scenario…`, 'info');
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
        `DAY 0 FORECAST: ${out.predictions ?? 0} predictions, ${out.manifests ?? 0} manifests (${out.source ?? 'model'}).`,
        'success',
      );
    } catch (err) {
      addActivityLog(`DAY 0 FORECAST: failed — ${err instanceof Error ? err.message : 'AI service unreachable'}.`, 'alert');
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
                  className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-md border border-amber-400/60 bg-amber-500/95 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg"
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
          <div className="bg-surface border border-line rounded-card max-w-md w-full mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h3 className="text-[17px] font-medium text-fg">Reset to scratch</h3>
              <p className="text-[13px] text-muted mt-1">This cannot be undone.</p>
            </div>
            <div className="px-5 py-4 text-[14px] text-muted">
              Clears all reports and generated plans (predictions, manifests, routes, volunteer
              positions) and un-blocks every road. Accounts and base map data are kept.
            </div>
            <div className="px-5 py-4 border-t border-line flex gap-2 justify-end">
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
          <div className="bg-surface border border-line rounded-card max-w-md w-full mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-line">
              <h3 className="text-[17px] font-medium text-fg">Run Day 0 Predictions</h3>
              <p className="text-[13px] text-muted mt-1">
                Forecast impact across communities before any field report arrives.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <label className="block text-[13px] text-muted">Storm scenario (PAGASA intensity)</label>
              <select
                value={day0Category}
                onChange={(e) => setDay0Category(Number(e.target.value))}
                disabled={day0Running}
                className="w-full px-3 py-2 text-[14px] text-fg bg-raised border border-line rounded-control cursor-pointer disabled:opacity-50"
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
                <span className="text-fg"> Predicted — Unconfirmed (Day 0)</span> and stay override-able;
                nothing is dispatched.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-line flex gap-2 justify-end">
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
                className="px-4 py-2 text-[13px] font-medium text-active bg-active/10 hover:bg-active/20 border border-active/30 rounded-control transition-colors duration-100 cursor-pointer disabled:opacity-50"
              >
                {day0Running ? 'Forecasting…' : 'Run forecast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 