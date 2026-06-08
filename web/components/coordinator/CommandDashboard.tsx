'use client';

import React, { useState, useEffect } from 'react';
import { 
  Barangay, 
  FieldReport, 
  Team, 
  RoadEdge, 
  Route, 
  ImpactPrediction, 
  SupplyManifest,
  mockBarangays, 
  mockFieldReports, 
  mockTeams, 
  mockRoadEdges, 
  mockRoutes, 
  mockImpactPredictions, 
  getSphereManifest, 
  computeSilentAreaScores 
} from '@/lib/mockData';
import LeftSidebar from './LeftSidebar';
import InteractiveCommandMap from './InteractiveCommandMap';
import BottomOperationsConsole from './BottomOperationsConsole';
import RightIntelligencePanel from './RightIntelligencePanel';
import OperationsPanel from './OperationsPanel';
import ReportsView from './ReportsView';
import TeamsView from './TeamsView';
import ManifestsView from './ManifestsView';

export default function CommandDashboard() {
  // Navigation View selection State
  const [currentView, setCurrentView] = useState('map');

  // Cebu Database States
  const [barangays, setBarangays] = useState<Barangay[]>(mockBarangays);
  const [reports, setReports] = useState<FieldReport[]>(mockFieldReports);
  const [teams, setTeams] = useState<Team[]>(mockTeams);
  const [edges, setEdges] = useState<RoadEdge[]>(mockRoadEdges);
  const [routes, setRoutes] = useState<Route[]>(mockRoutes);
  
  const [predictions, setPredictions] = useState<Record<string, ImpactPrediction>>(mockImpactPredictions);
  const [manifests, setManifests] = useState<Record<string, SupplyManifest>>({});

  // Selection states
  const [selectedBarangay, setSelectedBarangay] = useState<Barangay | null>(null);
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);

  // Scoring configurations
  const [tauHours, setTauHours] = useState(24);
  const [scores, setScores] = useState<{ barangayId: string; score: number; hoursSinceContact: number | null; timeFactor: number; popDensityNorm: number; hazardNorm: number }[]>([]);

  // Chronological EOC Log state
  const [activityLogs, setActivityLogs] = useState<{ id: string; time: string; event: string; type: 'info' | 'warn' | 'success' | 'alert' }[]>([
    { id: 'log-1', time: '13:14', event: 'SYSTEM: Silent Area Score mapping refreshed. 3 priority silence nodes surfaced.', type: 'info' },
    { id: 'log-2', time: '13:05', event: 'FIELD REPORT: Severe tidal overwash reported in Pasil coastal sector.', type: 'alert' },
    { id: 'log-3', time: '12:45', event: 'ROAD BLOCK: Gorordo Ave flagged slow due to low electrical wires obstruction.', type: 'warn' },
    { id: 'log-4', time: '12:12', event: 'SYSTEM: TabPFN v2 impact model computed population prediction matrix.', type: 'success' },
    { id: 'log-5', time: '11:00', event: 'SYSTEM: Typhoon landfall confirmed Cebu City coordinates. LUWAS Operations Active.', type: 'info' }
  ]);

  // Calculate scores on mount or whenever contact points update
  useEffect(() => {
    const computed = computeSilentAreaScores(barangays, tauHours);
    setScores(computed);
  }, [barangays, tauHours]);

  // Compute supply manifests based on effective predictions
  useEffect(() => {
    const updatedManifests: Record<string, SupplyManifest> = {};
    
    barangays.forEach(b => {
      const pred = predictions[b.id];
      const effectiveAffected = pred?.overrideValue !== null && pred?.overrideValue !== undefined 
        ? pred.overrideValue 
        : (pred?.predictedAffected || 0);
      
      const sphereBase = getSphereManifest(b.id, effectiveAffected);
      
      updatedManifests[b.id] = {
        ...sphereBase,
        status: manifests[b.id]?.status || 'pending',
        overridden: manifests[b.id]?.overridden ?? false
      };
    });

    setManifests(updatedManifests);
  }, [predictions, barangays]);

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
    
    // Auto-select matching barangay
    if (r && r.barangayId) {
      const matchingB = barangays.find(b => b.id === r.barangayId);
      if (matchingB) {
        setSelectedBarangay(matchingB);
      }
    }
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

  // Confirm pending field report
  const handleConfirmReport = (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;

    // 1. Mark report as confirmed
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'confirmed' } : r));

    // 2. Reset the barangay's contact time to "now"
    if (report.barangayId) {
      setBarangays(prev => prev.map(b => 
        b.id === report.barangayId 
          ? { ...b, lastConfirmedContact: new Date().toISOString() } 
          : b
      ));

      // Trigger state updates
      const updatedB = barangays.find(b => b.id === report.barangayId);
      if (updatedB) {
        setSelectedBarangay({ 
          ...updatedB, 
          lastConfirmedContact: new Date().toISOString() 
        });
      }
    }

    addActivityLog(`REPORT CONFIRMED: Incident report #${reportId} verified for ${report.barangayName}. Scores recalculated.`, 'success');
  };

  // Flag a report as unreliable
  const handleFlagReport = (reportId: string) => {
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'flagged' } : r));
    setSelectedReport(null);
    addActivityLog(`REPORT FLAGGED: Report #${reportId} flagged as unreliable.`, 'warn');
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

  // Pinned emergency action triggers
  const handleCreateIncident = () => {
    addActivityLog('OPERATIONS: New emergency incident manually logged in Cebu command table.', 'alert');
    alert('LUWAS Action: Incident creation form triggered. NGO logs updated.');
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
        onCreateIncident={handleCreateIncident}
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
    </div>
  );
}
