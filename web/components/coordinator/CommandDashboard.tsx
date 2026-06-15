'use client';

import React, { useState, useEffect } from 'react';
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
import type { LocationHub } from '@/lib/types/coordinator';
import LeftSidebar from './LeftSidebar';
import InteractiveCommandMap from './InteractiveCommandMap';
import BottomOperationsConsole from './BottomOperationsConsole';
import RightIntelligencePanel from './RightIntelligencePanel';
import OperationsPanel from './OperationsPanel';
import ReportsView from './ReportsView';
import TeamsView from './TeamsView';
import ManifestsView from './ManifestsView';
import { useLiveReports } from '@/lib/live/useLiveReports';
import { useLiveVolunteers } from '@/lib/live/useLiveVolunteers';

export default function CommandDashboard() {
  // Navigation View selection State
  const [currentView, setCurrentView] = useState('map');

  // Cebu Database States
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [reports, setReports] = useState<FieldReport[]>([]);
  // Live field_reports (volunteer PWA + SMS intake). Confirm/flag now persist to the DB.
  useLiveReports(setReports);
  // Live GPS markers (volunteer_positions over Realtime).
  const liveVolunteers = useLiveVolunteers();
  const [teams, setTeams] = useState<Team[]>([]);
  const [edges, setEdges] = useState<RoadEdge[]>([]);
  const [facilities, setFacilities] = useState<LocationHub[]>([]);

  // Live pipeline output (impact_predictions / supply_manifests / routes via Realtime),
  // mirrored into local state so coordinator overrides + dispatch stay optimistic (DB
  // persistence of overrides is Phase 4.2). The pipeline writes; these effects pull.
  const live = useLivePlan();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [predictions, setPredictions] = useState<Record<string, ImpactPrediction>>({});
  const [manifests, setManifests] = useState<Record<string, SupplyManifest>>({});
  useEffect(() => { setRoutes(live.routes); }, [live.routes]);
  useEffect(() => { setPredictions(live.predictions); }, [live.predictions]);
  useEffect(() => { setManifests(live.manifests); }, [live.manifests]);

  // Selection states
  const [selectedBarangay, setSelectedBarangay] = useState<Barangay | null>(null);
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);

  // Live Silent Area scores from Supabase — computed server-side by the
  // silent_area_score() pg_cron job (Phase 2.1), recomputed every 15 min.
  const [scores, setScores] = useState<{ barangayId: string; score: number; hoursSinceContact: number | null; timeFactor: number; popDensityNorm: number; hazardNorm: number }[]>([]);

  // Chronological EOC Log state
  const [activityLogs, setActivityLogs] = useState<{ id: string; time: string; event: string; type: 'info' | 'warn' | 'success' | 'alert' }[]>([]);

  // Load live barangays + Silent Area scores from Supabase on mount. The map, tooltips,
  // and intelligence panel all render from this real data (coordinator_barangay_scores
  // view). Reports / routes / teams remain demo overlays until their engines are wired.
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

  // Handlers
  const handleSelectBarangay = (b: Barangay) => {
    setSelectedBarangay(b);
    
    // Auto-select corresponding report if exists
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

    // A report may not carry a resolvable barangay UUID (e.g. SMS intake). Resolve to a real
    // barangay so the context panel opens: prefer an exact name match, else fall back to the
    // barangay whose centroid is nearest the report's coordinates.
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
  const handleSaveOverrides = (
    barangayId: string,
    affectedOverride: number | null,
    suppliesOverride: { waterL?: number; foodPacks?: number; shelterKits?: number; blankets?: number; hygieneKits?: number; medicalSupplies?: number; shelterMaterials?: number } | null
  ) => {
    // 1. Update predictions override
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

    // 2. Update manifests overrides
    setManifests(prev => {
      const current = prev[barangayId];
      if (!current) return prev;
      
      const formattedOverrides = suppliesOverride ? {
        waterL: suppliesOverride.waterL,
        foodPacks: suppliesOverride.foodPacks,
        hygieneKits: suppliesOverride.hygieneKits,
        medicalSupplies: suppliesOverride.medicalSupplies,
        shelterMaterials: suppliesOverride.shelterMaterials,
        // map backward compatibility
        shelterKits: suppliesOverride.shelterKits,
        blankets: suppliesOverride.blankets
      } : undefined;

      return {
        ...prev,
        [barangayId]: {
          ...current,
          status: 'modified',
          overrides: formattedOverrides as any,
          overridden: !!suppliesOverride
        }
      };
    });

    // Log the override
    addActivityLog(`COORDINATOR OVERRIDE: Modified supply parameters for Barangay ${barangays.find(b => b.id === barangayId)?.name}.`, 'warn');
  };

  // Confirm a pending field report: persist the status, then fire the end-to-end pipeline
  // (rescore -> TabPFN impact -> Sphere manifest -> OR-Tools route). Realtime streams the
  // results back into useLivePlan, so the map/panels update within seconds.
  const handleConfirmReport = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;

    // Optimistic UI: mark confirmed + reset the barangay's contact time to "now".
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

    // Backstop translation: app reports never hit /parse, so fill the English
    // translation here (online, coordinator-initiated). /api/translate skips
    // already-English text and persists the result; we mirror it into local state.
    if (!report.translatedText) {
      try {
        const tr = await fetch('/api/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId }),
        });
        const { translated_text } = await tr.json();
        if (translated_text) {
          setReports(prev => prev.map(r => r.id === reportId ? { ...r, translatedText: translated_text } : r));
        }
      } catch {
        addActivityLog(`TRANSLATION: unavailable for ${report.barangayName}.`, 'warn');
      }
    }

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

  // Flag a report as unreliable — persist so it drops out of pipeline_targets.
  const handleFlagReport = async (reportId: string) => {
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'flagged' } : r));
    setSelectedReport(null);
    const supabase = createClient();
    await supabase.from('field_reports').update({ status: 'flagged' }).eq('id', reportId);
    addActivityLog(`REPORT FLAGGED: #${reportId} flagged as unreliable.`, 'warn');
  };

  // Update Road Edge status (EOC accessibility)
  const handleUpdateRoadStatus = (edgeId: string, status: 'open' | 'slow' | 'blocked' | 'damaged', notes?: string) => {
    setEdges(prev => prev.map(e => e.id === edgeId ? { ...e, status, notes } : e));
    addActivityLog(`ROAD NETWORK: ${edges.find(e => e.id === edgeId)?.name} status updated to [${status.toUpperCase()}].`, status === 'open' ? 'info' : 'warn');
  };

  // Update supply manifest status (Approve, Reject)
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

  // Dispatch response team (OR-Tools routes activation)
  const handleDispatchTeam = (teamId: string, barangayId: string) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, status: 'dispatched', currentAssignment: `Relief Delivery to ${barangays.find(b => b.id === barangayId)?.name}` } : t));
    
    // Simulate routes updating
    setRoutes(prev => prev.map(r => r.teamId === teamId ? { ...r, status: 'active' } : r));

    const tName = teams.find(t => t.id === teamId)?.name;
    const bName = barangays.find(b => b.id === barangayId)?.name;
    
    addActivityLog(`TEAM DISPATCH: Deployed ${tName} to ${bName} with humanitarian cargo.`, 'success');
  };

  // Helper to append log item
  const addActivityLog = (event: string, type: 'info' | 'warn' | 'success' | 'alert' = 'info') => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivityLogs(prev => [
      { id: `log-${Date.now()}`, time: timeStr, event, type },
      ...prev
    ]);
  };

  // Reset / Clear to scratch — wipe reports + derived plans + GPS and restore the
  // map to a clean demo state (accounts + base data kept). Confirmed via a modal.
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
      // Clear operational state locally; base map data is refetched (rescore changed it).
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

  const handleClearBarangaySelection = () => {
    setSelectedBarangay(null);
    setSelectedReport(null);
  };

  // Global telemetry counters
  const reportsCount = reports.filter(r => r.status === 'pending').length;
  const highPriorityCount = scores.filter(s => s.score >= 0.5).length;
// Console resize state
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
    const delta = startYRef.current - e.clientY; // moving up increases height
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
      {/* Left Sidebar */}
      <LeftSidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        reportsCount={reportsCount}
        highPriorityCount={highPriorityCount}
        onReset={handleReset}
        // onBroadcastAlert={() => {}}
        // onExportReport={() => {}}
      />

      {/* Main workspace — switches based on currentView */}
      <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">

        {/* ── VIEW: Live Map (3-column EOC layout) ──
            Kept mounted across tabs (hidden, not unmounted) so MapLibre is
            created once — re-mounting it left the canvas blank on return. */}
        <div className={`flex-1 min-w-0 min-h-0 ${currentView === 'map' ? 'flex' : 'hidden'}`}>
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 min-h-0 p-4">
              <InteractiveCommandMap
                active={currentView === 'map'}
                barangays={barangays}
                reports={reports}
                teams={teams}
                edges={edges}
                routes={routes}
                facilities={facilities}
                volunteers={liveVolunteers}
                selectedBarangay={selectedBarangay}
                onSelectBarangay={handleSelectBarangay}
                selectedReport={selectedReport}
                onSelectReport={handleSelectReport}
                scores={scores}
                onUpdateRoadStatus={handleUpdateRoadStatus}
                onConfirmReport={handleConfirmReport}
                onFlagReport={handleFlagReport}
              />
            </div>
            <BottomOperationsConsole activityLogs={activityLogs} />
          </div>
          {/* Persistent right rail: Operations (triage) by default,
              entity detail when a barangay/report is selected. */}
          {selectedBarangay ? (
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

        {/* ── VIEW: Field Reports ── */}
        {currentView === 'reports' && (
          <ReportsView
            reports={reports}
            onFlagReport={handleFlagReport}
            onConfirmReport={handleConfirmReport}
          />
        )}

        {/* ── VIEW: Teams & Dispatch ── */}
        {currentView === 'teams' && (
          <TeamsView
            teams={teams}
            routes={routes}
            barangays={barangays}
            onDispatchTeam={handleDispatchTeam}
          />
        )}

        {/* ── VIEW: Supply Manifests ── */}
        {currentView === 'manifests' && (
          <ManifestsView
            barangays={barangays}
            manifests={manifests}
            predictions={predictions}
            onUpdateManifestStatus={handleUpdateManifestStatus}
          />
        )}

      </div>

      {/* Reset confirmation — destructive, irreversible without reseeding. */}
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
    </div>
  );
}
