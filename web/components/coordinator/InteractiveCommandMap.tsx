'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Compass,
  FileText,
  Clock,
  Check,
  AlertOctagon,
} from 'lucide-react';
import {
  Barangay,
  FieldReport,
  Team,
  RoadEdge,
  Route,
  mockLocationHubs,
  mockVolunteers,
} from '@/lib/mockData';

// ─── Leaflet types (avoid full @types/leaflet dep requirement) ───────────────
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L: any;
  }
}

interface InteractiveCommandMapProps {
  barangays: Barangay[];
  reports: FieldReport[];
  teams: Team[];
  edges: RoadEdge[];
  routes: Route[];
  selectedBarangay: Barangay | null;
  onSelectBarangay: (b: Barangay) => void;
  selectedReport: FieldReport | null;
  onSelectReport: (r: FieldReport) => void;
  scores: { barangayId: string; score: number; hoursSinceContact: number | null }[];
  onUpdateRoadStatus: (edgeId: string, status: 'open' | 'slow' | 'blocked' | 'damaged', notes?: string) => void;
  onConfirmReport: (reportId: string) => void;
  onFlagReport: (reportId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.7) return '#7f1d1d';
  if (score >= 0.4) return '#dc2626';
  if (score >= 0.2) return '#d97706';
  return '#0d5c56';
}

function roadStyle(status: string) {
  switch (status) {
    case 'slow':    return { color: '#d97706', weight: 3,   dashArray: undefined };
    case 'blocked': return { color: '#ef4444', weight: 2.5, dashArray: '6 4' };
    case 'damaged': return { color: '#b91c1c', weight: 4,   dashArray: '5 4' };
    default:        return { color: '#475569', weight: 2,   dashArray: undefined };
  }
}

function reportFillColor(source: string): string {
  if (source === 'sms')    return '#06b6d4';
  if (source === 'parsed') return '#a855f7';
  return '#0d9488';
}

function reportOutlineColor(status: string): string {
  if (status === 'pending') return '#eab308';
  if (status === 'flagged') return '#ef4444';
  return '#22c55e';
}

function hubColor(type: string): string {
  if (type === 'shelter')    return '#a855f7';
  if (type === 'supply_hub') return '#3b82f6';
  return '#2dd4bf';
}

function volColor(availability: string): string {
  if (availability === 'busy')    return '#eab308';
  if (availability === 'offline') return '#64748b';
  return '#22c55e';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InteractiveCommandMap({
  barangays,
  reports,
  teams,
  edges,
  routes,
  selectedBarangay,
  onSelectBarangay,
  selectedReport,
  onSelectReport,
  scores,
  onUpdateRoadStatus,
  onConfirmReport,
  onFlagReport,
}: InteractiveCommandMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerGroupsRef = useRef<Record<string, any>>({});
  const leafletLoadedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [mapLayers, setMapLayers] = useState({
    barangays: true,
    roads: true,
    reports: true,
    routes: true,
    teams: true,
    volunteers: true,
    hubs: true,
  });

  const [selectedEdge, setSelectedEdge] = useState<RoadEdge | null>(null);
  const [roadNotes, setRoadNotes] = useState('');

  const getScoreData = useCallback(
    (barangayId: string) =>
      scores.find((s) => s.barangayId === barangayId) ?? { score: 0, hoursSinceContact: null },
    [scores],
  );

  // ── Load Leaflet CSS + JS once ────────────────────────────────────────────
  useEffect(() => {
    if (leafletLoadedRef.current) return;
    leafletLoadedRef.current = true;

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
      document.head.appendChild(link);
    }

    if (!window.L) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
      script.onload = () => initMap();
      document.head.appendChild(script);
    } else {
      initMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Build / rebuild map overlays when data changes ────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    rebuildOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangays, reports, edges, routes, teams, scores]);

  // ── Sync visibility when layer toggles change ─────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const L = window.L;
    Object.entries(mapLayers).forEach(([key, visible]) => {
      const lg = layerGroupsRef.current[key];
      if (!lg) return;
      if (visible && !mapRef.current.hasLayer(lg)) lg.addTo(mapRef.current);
      if (!visible && mapRef.current.hasLayer(lg))  mapRef.current.removeLayer(lg);
    });
  }, [mapLayers]);

  // ── Highlight selected barangay ───────────────────────────────────────────
  useEffect(() => {
    // Re-render barangay layer so the selected ring updates
    if (!mapRef.current) return;
    rebuildBarangayLayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarangay]);

  // ─────────────────────────────────────────────────────────────────────────
  function initMap() {
    const L = window.L;
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [10.33, 123.905],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    // Muted OSM tile layer — desaturated so EOC overlays dominate
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'eoc-tiles',
    }).addTo(map);

    L.control.attribution({ prefix: false, position: 'bottomleft' })
      .addAttribution('© OpenStreetMap')
      .addTo(map);

    // Inject tile filter CSS once
    if (!document.getElementById('eoc-tile-style')) {
      const style = document.createElement('style');
      style.id = 'eoc-tile-style';
      style.textContent = `.eoc-tiles { filter: invert(1) hue-rotate(180deg) saturate(0.25) brightness(0.75) contrast(1.1); } .leaflet-container { background: #020617; }`;
      document.head.appendChild(style);
    }

    // Create layer groups
    const keys = ['barangays', 'roads', 'reports', 'routes', 'teams', 'volunteers', 'hubs'] as const;
    keys.forEach((k) => {
      layerGroupsRef.current[k] = L.layerGroup().addTo(map);
    });

    mapRef.current = map;
    rebuildOverlays();
  }

  function rebuildOverlays() {
    rebuildBarangayLayer();
    rebuildRoadLayer();
    rebuildReportLayer();
    rebuildRouteLayer();
    rebuildTeamLayer();
    rebuildVolunteerLayer();
    rebuildHubLayer();
  }

  function clearLayer(key: string) {
    layerGroupsRef.current[key]?.clearLayers();
  }

  // ── 1. Barangays ──────────────────────────────────────────────────────────
  function rebuildBarangayLayer() {
    const L = window.L;
    if (!L) return;
    clearLayer('barangays');
    const lg = layerGroupsRef.current['barangays'];

    barangays.forEach((b) => {
      const { score } = getScoreData(b.id);
      const fill = scoreColor(score);
      const critical = score >= 0.7;
      const isSelected = selectedBarangay?.id === b.id;

      const size = isSelected ? 20 : 16;
      const pulseRing = critical
        ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${fill};opacity:0.5;animation:eoc-ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>`
        : '';
      const selRing = isSelected
        ? `<div style="position:absolute;inset:-5px;border-radius:50%;border:1.5px dashed #2dd4bf;"></div>`
        : '';

      const html = `
        <div style="position:relative;width:${size}px;height:${size}px;">
          ${pulseRing}${selRing}
          <div style="position:absolute;inset:0;border-radius:50%;background:${fill};border:2px solid #020617;"></div>
        </div>`;

      const icon = L.divIcon({ html, className: '', iconAnchor: [size / 2, size / 2] });

      L.marker([b.latitude, b.longitude], { icon })
        .bindTooltip(
          `<span style="font-size:11px;color:#e2e8f0;background:#0f172a;padding:3px 8px;border-radius:4px;border:0.5px solid #334155;">${b.name}</span>`,
          { direction: 'top', opacity: 1, className: '', offset: [0, -(size / 2 + 4)] },
        )
        .on('click', () => onSelectBarangay(b))
        .addTo(lg);
    });
  }

  // ── 2. Roads ──────────────────────────────────────────────────────────────
  function rebuildRoadLayer() {
    const L = window.L;
    if (!L) return;
    clearLayer('roads');
    const lg = layerGroupsRef.current['roads'];

    edges.forEach((edge) => {
      const s = roadStyle(edge.status);
      const isSelected = selectedEdge?.id === edge.id;

      if (isSelected) {
        L.polyline(
          [[edge.sourceCoords.lat, edge.sourceCoords.lng], [edge.targetCoords.lat, edge.targetCoords.lng]],
          { color: '#2dd4bf', weight: s.weight + 3, opacity: 0.6, lineCap: 'round' },
        ).addTo(lg);
      }

      L.polyline(
        [[edge.sourceCoords.lat, edge.sourceCoords.lng], [edge.targetCoords.lat, edge.targetCoords.lng]],
        { color: s.color, weight: s.weight, dashArray: s.dashArray, opacity: 0.9, lineCap: 'round' },
      )
        .on('click', () => {
          setSelectedEdge(edge);
          setRoadNotes(edge.notes ?? '');
          onSelectReport(null as unknown as FieldReport);
        })
        .addTo(lg);
    });
  }

  // ── 3. Reports ────────────────────────────────────────────────────────────
  function rebuildReportLayer() {
    const L = window.L;
    if (!L) return;
    clearLayer('reports');
    const lg = layerGroupsRef.current['reports'];

    reports.forEach((report) => {
      const fill = reportFillColor(report.source);
      const outline = reportOutlineColor(report.status);
      const isSelected = selectedReport?.id === report.id;
      const size = isSelected ? 16 : 13;

      const html = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${fill};border:${isSelected ? 3 : 2}px solid ${outline};box-shadow:0 0 0 1px #020617;"></div>`;
      const icon = L.divIcon({ html, className: '', iconAnchor: [size / 2, size / 2] });

      L.marker([report.latitude, report.longitude], { icon })
        .bindTooltip(
          `<span style="font-size:10px;color:#e2e8f0;background:#0f172a;padding:3px 8px;border-radius:4px;border:0.5px solid #334155;max-width:180px;display:block;">${report.rawText}</span>`,
          { direction: 'top', opacity: 1, className: '', offset: [0, -(size / 2 + 4)] },
        )
        .on('click', () => {
          onSelectReport(report);
          setSelectedEdge(null);
        })
        .addTo(lg);
    });
  }

  // ── 4. Routes ─────────────────────────────────────────────────────────────
  function rebuildRouteLayer() {
    const L = window.L;
    if (!L) return;
    clearLayer('routes');
    const lg = layerGroupsRef.current['routes'];

    routes.forEach((route) => {
      if (route.path.length < 2) return;
      const latlngs = route.path.map((p) => [p.lat, p.lng]);
      const isActive    = route.status === 'active';
      const isCompleted = route.status === 'completed';

      L.polyline(latlngs, {
        color: '#0d9488',
        weight: isActive ? 3.5 : 2.5,
        dashArray: isActive ? undefined : '5 4',
        opacity: isCompleted ? 0.35 : 0.85,
        lineCap: 'round',
      }).addTo(lg);
    });
  }

  // ── 5. Teams ──────────────────────────────────────────────────────────────
  function rebuildTeamLayer() {
    const L = window.L;
    if (!L) return;
    clearLayer('teams');
    const lg = layerGroupsRef.current['teams'];

    teams.forEach((team) => {
      const label = team.capacityKg >= 1000
        ? `${(team.capacityKg / 1000).toFixed(1)}t`
        : `${team.capacityKg}k`;

      const html = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
          <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid #64748b;filter:drop-shadow(0 0 0 1px #020617);"></div>
          <div style="background:#1e293b;border:0.5px solid #475569;border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;color:#cbd5e1;font-family:monospace;">${label}</div>
        </div>`;

      const icon = L.divIcon({ html, className: '', iconAnchor: [7, 6] });
      L.marker([team.baseLocation.lat + 0.005, team.baseLocation.lng + 0.005], { icon })
        .bindTooltip(
          `<span style="font-size:10px;color:#e2e8f0;background:#0f172a;padding:3px 8px;border-radius:4px;border:0.5px solid #334155;">${team.name}</span>`,
          { direction: 'top', opacity: 1, className: '', offset: [0, -14] },
        )
        .addTo(lg);
    });
  }

  // ── 6. Volunteers ─────────────────────────────────────────────────────────
  function rebuildVolunteerLayer() {
    const L = window.L;
    if (!L) return;
    clearLayer('volunteers');
    const lg = layerGroupsRef.current['volunteers'];

    mockVolunteers.forEach((vol) => {
      const fill = volColor(vol.availability);
      const html = `<div style="width:7px;height:7px;border-radius:50%;background:${fill};border:1px solid #020617;opacity:0.85;"></div>`;
      const icon = L.divIcon({ html, className: '', iconAnchor: [3.5, 3.5] });
      L.marker([vol.latitude, vol.longitude], { icon }).addTo(lg);
    });
  }

  // ── 7. Hubs ───────────────────────────────────────────────────────────────
  function rebuildHubLayer() {
    const L = window.L;
    if (!L) return;
    clearLayer('hubs');
    const lg = layerGroupsRef.current['hubs'];

    mockLocationHubs.forEach((hub) => {
      const fill = hubColor(hub.type);
      const html = `
        <div style="position:relative;width:12px;height:12px;">
          <div style="position:absolute;inset:0;background:${fill};border:2px solid #020617;"></div>
          <div style="position:absolute;inset:3px;background:#020617;"></div>
        </div>`;
      const icon = L.divIcon({ html, className: '', iconAnchor: [6, 6] });
      L.marker([hub.latitude, hub.longitude], { icon })
        .bindTooltip(
          `<span style="font-size:10px;color:#e2e8f0;background:#0f172a;padding:3px 8px;border-radius:4px;border:0.5px solid #334155;">${hub.name}</span>`,
          { direction: 'top', opacity: 1, className: '', offset: [0, -8] },
        )
        .addTo(lg);
    });
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().catch(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    const onKeyDown  = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) setIsFullscreen(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  const zoomIn    = () => mapRef.current?.zoomIn();
  const zoomOut   = () => mapRef.current?.zoomOut();
  const resetView = () => mapRef.current?.setView([10.33, 123.905], 13);

  // ── Road status update ────────────────────────────────────────────────────
  const handleRoadStatusChange = (status: 'open' | 'slow' | 'blocked' | 'damaged') => {
    if (!selectedEdge) return;
    onUpdateRoadStatus(selectedEdge.id, status, roadNotes);
    setSelectedEdge((prev) => (prev ? { ...prev, status, notes: roadNotes } : null));
    rebuildRoadLayer();
  };

  // ─────────────────────────────────────────────────────────────────────────

  const LAYER_BUTTONS: { key: keyof typeof mapLayers; label: string }[] = [
    { key: 'barangays', label: 'Barangays' },
    { key: 'roads',     label: 'Roads' },
    { key: 'reports',   label: 'Reports' },
    { key: 'routes',    label: 'Routes' },
    { key: 'teams',     label: 'Teams' },
    { key: 'volunteers',label: 'Volunteers' },
    { key: 'hubs',      label: 'Hubs' },
  ];

  return (
    <div
      ref={wrapperRef}
      className={`relative flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-lg${
        isFullscreen && !document.fullscreenElement ? ' fixed inset-0 z-[9999] h-screen w-screen rounded-none border-0' : ' h-full'
      }`}
    >

      {/* ── Inject keyframe for pulse animation ── */}
      <style>{`
        @keyframes eoc-ping {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50%       { transform: scale(1.8); opacity: 0; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between z-10 select-none">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-teal-400" />
          <span className="font-bold text-[11px] uppercase tracking-wider text-slate-300">
            Live Operations Map
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-[10px] text-slate-400">
          {LAYER_BUTTONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMapLayers((p) => ({ ...p, [key]: !p[key] }))}
              className={`px-2 py-1 rounded transition-colors ${
                mapLayers[key]
                  ? 'bg-slate-900 text-teal-400 font-semibold'
                  : 'hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Map area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Leaflet container */}
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* ── Fullscreen button top-left ── */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          className="absolute top-3 left-3 z-[1000] w-7 h-7 bg-slate-900/90 border border-slate-700 hover:border-teal-600 text-slate-300 hover:text-teal-300 rounded flex items-center justify-center cursor-pointer transition-colors select-none backdrop-blur-sm"
        >
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
            </svg>
          )}
        </button>

        {/* ── Zoom controls ── */}
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
          {[
            { label: '+', title: 'Zoom In',  action: zoomIn },
            { label: '−', title: 'Zoom Out', action: zoomOut },
            { label: '⌂', title: 'Reset',    action: resetView },
          ].map(({ label, title, action }) => (
            <button
              key={title}
              onClick={action}
              title={title}
              className="w-7 h-7 bg-slate-900/90 border border-slate-700 hover:border-teal-600 text-slate-300 hover:text-teal-300 rounded flex items-center justify-center font-bold text-sm cursor-pointer transition-colors select-none backdrop-blur-sm"
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Road edge popup ── */}
        {selectedEdge && (
          <div className="absolute top-4 left-4 w-[280px] bg-slate-950/95 border border-slate-800 p-3 rounded-lg text-xs flex flex-col gap-2 z-[1000] shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="font-bold text-slate-300 truncate max-w-[200px]">
                {selectedEdge.name}
              </span>
              <button
                onClick={() => setSelectedEdge(null)}
                className="text-slate-500 hover:text-slate-300 font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                Accessibility Status
              </span>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                {(['open','slow','blocked','damaged'] as const).map((s) => {
                  const styles: Record<string, string> = {
                    open:    'bg-slate-900 border-slate-700 text-slate-200',
                    slow:    'bg-amber-950/60 border-amber-800 text-amber-300',
                    blocked: 'bg-red-950/60 border-red-800 text-red-300',
                    damaged: 'bg-red-950 border-red-800 text-red-200',
                  };
                  const labels: Record<string, string> = {
                    open: 'Open (Gray)', slow: 'Slow (Amber)',
                    blocked: 'Blocked (Dashed)', damaged: 'Damaged (Thick)',
                  };
                  const active = selectedEdge.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleRoadStatusChange(s)}
                      className={`py-1 border rounded font-semibold cursor-pointer transition-colors ${
                        active ? styles[s] : 'border-slate-800 hover:bg-slate-900 text-slate-500'
                      }`}
                    >
                      {labels[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1 mt-1">
              <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                Obstruction Notes
              </label>
              <textarea
                value={roadNotes}
                onChange={(e) => setRoadNotes(e.target.value)}
                placeholder="Details of blockage..."
                className="w-full bg-slate-900 border border-slate-800 p-1.5 rounded text-[10.5px] text-slate-300 focus:outline-none focus:border-teal-500 resize-none h-12"
              />
            </div>

            <button
              onClick={() => {
                onUpdateRoadStatus(selectedEdge.id, selectedEdge.status, roadNotes);
                setSelectedEdge(null);
              }}
              className="w-full py-1.5 bg-teal-900 hover:bg-teal-800 border border-teal-800 text-teal-200 font-bold rounded transition-colors cursor-pointer"
            >
              Save Road Status
            </button>
          </div>
        )}

        {/* ── Field report popup ── */}
        {selectedReport && (
          <div className="absolute top-4 left-4 w-[280px] bg-slate-950/95 border border-slate-800 p-3.5 rounded-lg text-xs flex flex-col gap-2 z-[1000] shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-400" />
                <span className="font-bold text-slate-300 uppercase">
                  Report #{selectedReport.id}
                </span>
              </div>
              <button
                onClick={() => onSelectReport(null as unknown as FieldReport)}
                className="text-slate-500 hover:text-slate-300 font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>
                  Reporter:{' '}
                  <strong className="text-slate-400">{selectedReport.reporterName}</strong>
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(selectedReport.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 p-2 rounded italic text-[11px] text-slate-300 leading-relaxed">
                &ldquo;{selectedReport.rawText}&rdquo;
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">
                    Related Barangay
                  </span>
                  <span className="text-slate-300 font-semibold">
                    {selectedReport.barangayName ?? 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">
                    Confidence Score
                  </span>
                  <span className="text-slate-300 font-semibold">
                    {Math.round(selectedReport.confidence * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {selectedReport.status === 'pending' && (
              <div className="flex items-center gap-2 mt-1.5 pt-2 border-t border-slate-900">
                <button
                  onClick={() => {
                    onConfirmReport(selectedReport.id);
                    onSelectReport(null as unknown as FieldReport);
                  }}
                  className="flex-1 py-1.5 bg-teal-900 hover:bg-teal-800 border border-teal-800 text-teal-200 font-bold rounded flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
                >
                  <Check className="w-3 h-3" /> Confirm
                </button>
                <button
                  onClick={() => {
                    onFlagReport(selectedReport.id);
                    onSelectReport(null as unknown as FieldReport);
                  }}
                  className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-red-400 font-bold rounded flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
                >
                  <AlertOctagon className="w-3 h-3" /> Flag
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Legend ── */}
        <div className="absolute bottom-4 right-4 z-[1000] bg-slate-950/90 border border-slate-800 p-2.5 rounded-lg text-[9px] text-slate-400 flex flex-col gap-1.5 max-w-[150px] shadow-lg select-none backdrop-blur-sm">
          <div className="font-bold text-slate-300 border-b border-slate-800 pb-0.5 uppercase tracking-wide">
            Map Legend
          </div>

          {[
            { color: '#0d5c56', label: 'Normal (Dark Teal)' },
            { color: '#d97706', label: 'Watch (Amber)' },
            { color: '#dc2626', label: 'High Risk (Red)' },
            { color: '#7f1d1d', label: 'Critical Silence', pulse: true },
          ].map(({ color, label, pulse }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full border border-slate-950 ${pulse ? 'animate-pulse' : ''}`}
                style={{ background: color }}
              />
              <span>{label}</span>
            </div>
          ))}

          <div className="border-t border-slate-800 pt-1 flex flex-col gap-1.5 mt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#475569] inline-block" />
              <span>Road: Open</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#d97706] inline-block" />
              <span>Road: Slow</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0 border-t-2 border-dashed border-[#ef4444] inline-block" />
              <span>Road: Blocked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0 border-t-[3px] border-dashed border-[#b91c1c] inline-block" />
              <span>Road: Damaged</span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-1 flex flex-col gap-1.5 mt-0.5">
            {[
              { color: '#06b6d4', label: 'Report: SMS' },
              { color: '#0d9488', label: 'Report: Mobile' },
              { color: '#a855f7', label: 'Report: Parsed' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}