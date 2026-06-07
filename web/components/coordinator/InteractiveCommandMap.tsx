'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Compass, 
  Layers, 
  MapPin, 
  AlertTriangle, 
  Navigation, 
  Truck, 
  Home, 
  Info, 
  Check, 
  AlertOctagon, 
  FileText,
  Clock,
  Shield,
  Activity,
  Archive
} from 'lucide-react';
import { 
  Barangay, 
  FieldReport, 
  Team, 
  RoadEdge, 
  Route, 
  Volunteer, 
  LocationHub,
  mockLocationHubs,
  mockVolunteers
} from '@/lib/mockData';

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
  onFlagReport
}: InteractiveCommandMapProps) {
  // Map dimensions
  const width = 600;
  const height = 550;

  // Active layers
  const [mapLayers, setMapLayers] = useState({
    barangays: true,
    roads: true,
    reports: true,
    routes: true,
    teams: true,
    volunteers: true,
    hubs: true
  });

  // Selected road edge for direct on-map editing
  const [selectedEdge, setSelectedEdge] = useState<RoadEdge | null>(null);
  const [roadNotes, setRoadNotes] = useState('');

  // ── Zoom & Pan state ──────────────────────────────────────────────────────
  const [viewport, setViewport] = useState({ scale: 1, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  // Pan tracking — use refs so state changes don't cause re-renders during drag
  const isPanning = useRef(false);           // true only after drag threshold crossed
  const pointerDownStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });
  const DRAG_THRESHOLD_PX = 5;              // pixels before pan locks in
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 6;

  const clampTranslate = useCallback((scale: number, tx: number, ty: number) => {
    const maxTx = width  * scale * 0.8;
    const maxTy = height * scale * 0.8;
    return {
      tx: Math.max(-maxTx, Math.min(maxTx, tx)),
      ty: Math.max(-maxTy, Math.min(maxTy, ty)),
    };
  }, [width, height]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.12 : 0.89;
    setViewport(prev => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * delta));
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return prev;
      const svgW = rect.width;
      const svgH = rect.height;
      const cursorX = ((e.clientX - rect.left) / svgW) * width;
      const cursorY = ((e.clientY - rect.top)  / svgH) * height;
      const scaleFactor = newScale / prev.scale;
      const rawTx = cursorX + (prev.tx - cursorX) * scaleFactor;
      const rawTy = cursorY + (prev.ty - cursorY) * scaleFactor;
      const { tx, ty } = clampTranslate(newScale, rawTx, rawTy);
      return { scale: newScale, tx, ty };
    });
  }, [clampTranslate, width, height]);

  // ── Threshold-based pan: record intent on pointerdown, commit only after drag ──
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Record where the press started — don't pan yet, don't capture yet.
    pointerDownStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    lastPointer.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointerDownStart.current) return;

    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;

    if (!isPanning.current) {
      // Check if we've exceeded the drag threshold
      const totalDx = e.clientX - pointerDownStart.current.x;
      const totalDy = e.clientY - pointerDownStart.current.y;
      const dist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);
      if (dist < DRAG_THRESHOLD_PX) return; // still just a click — ignore

      // Threshold crossed — commit to panning now
      isPanning.current = true;
      (e.currentTarget as SVGSVGElement).setPointerCapture(pointerDownStart.current.pointerId);
    }

    lastPointer.current = { x: e.clientX, y: e.clientY };

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgDx = (dx / rect.width)  * width;
    const svgDy = (dy / rect.height) * height;

    setViewport(prev => {
      const { tx, ty } = clampTranslate(prev.scale, prev.tx + svgDx, prev.ty + svgDy);
      return { ...prev, tx, ty };
    });
  }, [clampTranslate, width, height]);

  const handlePointerUp = useCallback(() => {
    isPanning.current = false;
    pointerDownStart.current = null;
  }, []);

  const zoomIn  = () => setViewport(prev => {
    const newScale = Math.min(MAX_SCALE, prev.scale * 1.25);
    const { tx, ty } = clampTranslate(newScale, prev.tx, prev.ty);
    return { scale: newScale, tx, ty };
  });
  const zoomOut = () => setViewport(prev => {
    const newScale = Math.max(MIN_SCALE, prev.scale / 1.25);
    const { tx, ty } = clampTranslate(newScale, prev.tx, prev.ty);
    return { scale: newScale, tx, ty };
  });
  const resetView = () => setViewport({ scale: 1, tx: 0, ty: 0 });
  // ─────────────────────────────────────────────────────────────────────────

  // Projections
  const projectCoords = (lat: number, lng: number) => {
    const minLng = 123.875;
    const maxLng = 123.935;
    const minLat = 10.285;
    const maxLat = 10.375;

    const x = ((lng - minLng) / (maxLng - minLng)) * width;
    const y = height - ((lat - minLat) / (maxLat - minLat)) * height;

    return { x: Math.max(10, Math.min(x, width - 10)), y: Math.max(10, Math.min(y, height - 10)) };
  };

  const getScoreData = (barangayId: string) => {
    return scores.find(s => s.barangayId === barangayId) || { score: 0, hoursSinceContact: null };
  };

  // Barangay colors per EOC specification:
  // Normal -> Dark Teal
  // Watch -> Amber
  // High Risk -> Red
  // Critical Silence -> Pulsing Red
  const getBarangayFillColor = (score: number) => {
    if (score >= 0.7) return '#7f1d1d'; // Critical Silence - Solid Dark Red
    if (score >= 0.4) return '#dc2626'; // High Risk - Solid Red
    if (score >= 0.2) return '#d97706'; // Watch - Amber
    return '#0d5c56'; // Normal - Dark Teal
  };

  // Format timestamp helper
  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'No contact since incident';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + Math.round((Date.now() - date.getTime()) / (3600 * 1000)) + 'h ago)';
  };

  const handleRoadStatusChange = (status: 'open' | 'slow' | 'blocked' | 'damaged') => {
    if (selectedEdge) {
      onUpdateRoadStatus(selectedEdge.id, status, roadNotes);
      // Update local state
      setSelectedEdge(prev => prev ? { ...prev, status, notes: roadNotes } : null);
    }
  };

  return (
    <div className="relative flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full shadow-lg">
      {/* Map Control Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between z-10 select-none">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-teal-400" />
          <span className="font-bold text-[11px] uppercase tracking-wider text-slate-300">Live Operations Map</span>
        </div>

        {/* EOC Layer Toggles */}
        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-[10px] text-slate-400">
          <button 
            onClick={() => setMapLayers(p => ({ ...p, barangays: !p.barangays }))}
            className={`px-2 py-1 rounded transition-colors ${mapLayers.barangays ? 'bg-slate-900 text-teal-400 font-semibold' : 'hover:text-slate-200'}`}
          >
            Barangays
          </button>
          <button 
            onClick={() => setMapLayers(p => ({ ...p, roads: !p.roads }))}
            className={`px-2 py-1 rounded transition-colors ${mapLayers.roads ? 'bg-slate-900 text-teal-400 font-semibold' : 'hover:text-slate-200'}`}
          >
            Roads
          </button>
          <button 
            onClick={() => setMapLayers(p => ({ ...p, reports: !p.reports }))}
            className={`px-2 py-1 rounded transition-colors ${mapLayers.reports ? 'bg-slate-900 text-teal-400 font-semibold' : 'hover:text-slate-200'}`}
          >
            Reports
          </button>
          <button 
            onClick={() => setMapLayers(p => ({ ...p, routes: !p.routes }))}
            className={`px-2 py-1 rounded transition-colors ${mapLayers.routes ? 'bg-slate-900 text-teal-400 font-semibold' : 'hover:text-slate-200'}`}
          >
            Routes
          </button>
          <button 
            onClick={() => setMapLayers(p => ({ ...p, teams: !p.teams }))}
            className={`px-2 py-1 rounded transition-colors ${mapLayers.teams ? 'bg-slate-900 text-teal-400 font-semibold' : 'hover:text-slate-200'}`}
          >
            Teams
          </button>
          <button 
            onClick={() => setMapLayers(p => ({ ...p, volunteers: !p.volunteers }))}
            className={`px-2 py-1 rounded transition-colors ${mapLayers.volunteers ? 'bg-slate-900 text-teal-400 font-semibold' : 'hover:text-slate-200'}`}
          >
            Volunteers
          </button>
          <button 
            onClick={() => setMapLayers(p => ({ ...p, hubs: !p.hubs }))}
            className={`px-2 py-1 rounded transition-colors ${mapLayers.hubs ? 'bg-slate-900 text-teal-400 font-semibold' : 'hover:text-slate-200'}`}
          >
            Hubs
          </button>
        </div>
      </div>

      {/* SVG Canvas Map */}
      <div className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/60 to-slate-950/80 flex items-center justify-center overflow-hidden">

        {/* Zoom Controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          <button
            onClick={zoomIn}
            className="w-7 h-7 bg-slate-900 border border-slate-700 hover:border-teal-600 text-slate-300 hover:text-teal-300 rounded flex items-center justify-center font-bold text-sm cursor-pointer transition-colors select-none"
            title="Zoom In"
          >+</button>
          <button
            onClick={zoomOut}
            className="w-7 h-7 bg-slate-900 border border-slate-700 hover:border-teal-600 text-slate-300 hover:text-teal-300 rounded flex items-center justify-center font-bold text-sm cursor-pointer transition-colors select-none"
            title="Zoom Out"
          >−</button>
          <button
            onClick={resetView}
            className="w-7 h-7 bg-slate-900 border border-slate-700 hover:border-teal-600 text-slate-400 hover:text-teal-300 rounded flex items-center justify-center text-[9px] font-bold cursor-pointer transition-colors select-none"
            title="Reset View"
          >⌂</button>
        </div>

        {/* Zoom level badge */}
        <div className="absolute bottom-3 left-3 z-10 bg-slate-950/80 border border-slate-800 px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-500 select-none">
          {Math.round(viewport.scale * 100)}%
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full select-none"
          style={{ cursor: isPanning.current ? 'grabbing' : 'grab' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Viewport transform group — all map content lives here */}
          <g transform={`translate(${viewport.tx}, ${viewport.ty}) scale(${viewport.scale})`}>
          {/* Rigid grid for emergency coordination */}
          <g stroke="#1e293b" strokeWidth="0.5" opacity="0.4">
            {Array.from({ length: 15 }).map((_, i) => (
              <line key={`x-${i}`} x1={(i + 1) * (width / 15)} y1="0" x2={(i + 1) * (width / 15)} y2={height} />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={`y-${i}`} x1="0" y1={(i + 1) * (height / 12)} x2={width} y2={(i + 1) * (height / 12)} />
            ))}
          </g>

          {/* Coastal Contour Layer representation */}
          <path 
            d="M 60,60 Q 130,90 190,190 T 270,350 T 320,490 L 460,530 Q 530,390 490,250 T 370,120 T 260,30 Z" 
            fill="#0f172a" 
            stroke="#1e293b" 
            strokeWidth="1.5" 
            opacity="0.8"
          />

          {/* 1. BARANGAYS CENTROIDS LAYER */}
          {mapLayers.barangays && (
            <g>
              {barangays.map((b) => {
                const { x, y } = projectCoords(b.latitude, b.longitude);
                const scoreInfo = getScoreData(b.id);
                const fillColor = getBarangayFillColor(scoreInfo.score);
                const isSelected = selectedBarangay?.id === b.id;
                const isPulsing = scoreInfo.score >= 0.7; // Critical Silence

                return (
                  <g 
                    key={`barangay-${b.id}`}
                    transform={`translate(${x}, ${y})`}
                    className="cursor-pointer"
                    onClick={() => {
                      onSelectBarangay(b);
                      setSelectedEdge(null);
                    }}
                  >
                    {/* Ring selection highlight */}
                    {isSelected && (
                      <circle cx="0" cy="0" r="14" fill="none" stroke="#2dd4bf" strokeWidth="1.5" strokeDasharray="3 2" />
                    )}

                    {/* EOC Pulsing Red indicator for Critical Silence */}
                    {isPulsing && (
                      <circle cx="0" cy="0" r="11" fill="none" stroke="#ef4444" strokeWidth="1.5" className="animate-ping opacity-60" />
                    )}

                    {/* Central Area node */}
                    <circle
                      cx="0"
                      cy="0"
                      r={isSelected ? 7.5 : 6}
                      fill={fillColor}
                      stroke="#020617"
                      strokeWidth="1.5"
                    />

                    {/* Clean EOC text label */}
                    <text
                      x="10"
                      y="3.5"
                      fill={isSelected ? '#2dd4bf' : '#94a3b8'}
                      fontSize="9px"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      className="font-sans font-medium pointer-events-none"
                    >
                      {b.name}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* 2. ROAD CONDITIONS LAYER (road_edges) */}
          {mapLayers.roads && (
            <g>
              {edges.map((edge) => {
                const p1 = projectCoords(edge.sourceCoords.lat, edge.sourceCoords.lng);
                const p2 = projectCoords(edge.targetCoords.lat, edge.targetCoords.lng);

                // Define styling based on EOC road severity specs
                let strokeColor = '#475569'; // Open (Neutral Gray)
                let strokeWidth = 1.5;
                let dashArray = '0';
                let isPulse = false;

                if (edge.status === 'slow') {
                  strokeColor = '#d97706'; // Slow (Amber)
                  strokeWidth = 2.0;
                } else if (edge.status === 'blocked') {
                  strokeColor = '#ef4444'; // Blocked (Red dashed)
                  strokeWidth = 2.0;
                  dashArray = '4 3';
                  isPulse = true;
                } else if (edge.status === 'damaged') {
                  strokeColor = '#b91c1c'; // Damaged (Thick red dashed)
                  strokeWidth = 3.5;
                  dashArray = '5 4';
                  isPulse = true;
                }

                const isEdgeSelected = selectedEdge?.id === edge.id;

                return (
                  <g key={`edge-${edge.id}`}>
                    {/* Wider hit zone for clickability */}
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="transparent"
                      strokeWidth="10"
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedEdge(edge);
                        setRoadNotes(edge.notes || '');
                        onSelectReport(null as unknown as FieldReport);
                      }}
                    />

                    {/* Selection outline */}
                    {isEdgeSelected && (
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#2dd4bf"
                        strokeWidth={strokeWidth + 2.5}
                        opacity="0.8"
                        strokeLinecap="round"
                      />
                    )}

                    {/* Main road link line */}
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dashArray}
                      strokeLinecap="round"
                      className={isPulse ? 'animate-pulse' : ''}
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* 3. DISPATCH ROUTES LAYER (Teal routes) */}
          {mapLayers.routes && (
            <g opacity="0.9">
              {routes.map((route) => {
                const points = route.path.map(p => projectCoords(p.lat, p.lng));
                if (points.length < 2) return null;

                const pathD = points.reduce((acc, p, idx) => 
                  idx === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`, ''
                );

                const isActive = route.status === 'active';
                const isCompleted = route.status === 'completed';

                return (
                  <path
                    key={`route-${route.id}`}
                    d={pathD}
                    fill="none"
                    stroke="#0d9488" // Teal color lines
                    strokeWidth={isActive ? 3.5 : 2.5}
                    strokeDasharray={isActive ? '0' : '5 4'} // solid active, dashed planned
                    opacity={isCompleted ? 0.35 : 0.85} // faded completed
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          )}

          {/* 4. FIELD REPORTS LAYER (Pins color-coded by source, outline by verification status) */}
          {mapLayers.reports && (
            <g>
              {reports.map((report) => {
                const { x, y } = projectCoords(report.latitude, report.longitude);
                const isSelected = selectedReport?.id === report.id;

                // Source Colors per Spec:
                // SMS -> Cyan
                // Mobile -> Teal
                // Parsed -> Purple
                let pinColor = '#0d9488'; // Default Mobile (Teal)
                if (report.source === 'sms') pinColor = '#06b6d4'; // SMS (Cyan)
                if (report.source === 'parsed') pinColor = '#a855f7'; // Parsed (Purple)

                // Outline Status colors per Spec:
                // Pending -> Yellow outline
                // Confirmed -> Green outline
                // Flagged -> Red outline
                let outlineColor = '#22c55e'; // Confirmed (Green)
                if (report.status === 'pending') outlineColor = '#eab308'; // Pending (Yellow)
                if (report.status === 'flagged') outlineColor = '#ef4444'; // Flagged (Red)

                return (
                  <g 
                    key={`pin-${report.id}`} 
                    transform={`translate(${x}, ${y})`}
                    className="cursor-pointer"
                    onClick={() => {
                      onSelectReport(report);
                      setSelectedEdge(null);
                    }}
                  >
                    {/* Ring outline */}
                    <circle 
                      cx="0" 
                      cy="-8" 
                      r="7.5" 
                      fill="none" 
                      stroke={outlineColor} 
                      strokeWidth={isSelected ? 2.5 : 1.5} 
                    />

                    {/* Center report node dot */}
                    <circle 
                      cx="0" 
                      cy="-8" 
                      r="4.5" 
                      fill={pinColor} 
                      stroke="#020617" 
                      strokeWidth="1" 
                    />

                    {/* Standard EOC marker bottom pin locator */}
                    <path d="M-1 -1 L0 0 L1 -1 Z" fill={outlineColor} stroke={outlineColor} strokeWidth="1" />
                  </g>
                );
              })}
            </g>
          )}

          {/* 5. WAREHOUSES & HUBS LAYER */}
          {mapLayers.hubs && (
            <g>
              {mockLocationHubs.map((hub) => {
                const { x, y } = projectCoords(hub.latitude, hub.longitude);
                
                let hubColor = '#2dd4bf'; // Warehouse - Teal
                if (hub.type === 'shelter') hubColor = '#a855f7'; // Shelter - Purple
                if (hub.type === 'supply_hub') hubColor = '#3b82f6'; // Hub - Blue

                return (
                  <g key={hub.id} transform={`translate(${x}, ${y})`}>
                    {/* Square representation */}
                    <rect 
                      x="-5.5" 
                      y="-5.5" 
                      width="11" 
                      height="11" 
                      fill={hubColor} 
                      stroke="#020617" 
                      strokeWidth="1.5" 
                    />
                    {/* Capacity indicators dot inside */}
                    <rect x="-2" y="-2" width="4" height="4" fill="#020617" />
                  </g>
                );
              })}
            </g>
          )}

          {/* 6. DEPLOYED TEAMS LAYER (Simple markers with capacity badge) */}
          {mapLayers.teams && (
            <g>
              {teams.map((team) => {
                // If team is active/dispatched, represent it.
                // Let's place teams near their bases or route paths
                const { x, y } = projectCoords(team.baseLocation.lat + 0.005, team.baseLocation.lng + 0.005);

                return (
                  <g key={`team-marker-${team.id}`} transform={`translate(${x}, ${y})`}>
                    {/* Simple grey marker triangle for fleet */}
                    <polygon 
                      points="0,-8 -7,5 7,5" 
                      fill="#64748b" 
                      stroke="#cbd5e1" 
                      strokeWidth="1.5" 
                    />
                    
                    {/* Capacity Badge */}
                    <g transform="translate(0, 11)">
                      <rect x="-11" y="-5" width="22" height="10" fill="#1e293b" stroke="#475569" strokeWidth="1" rx="2" />
                      <text x="0" y="3" fill="#cbd5e1" fontSize="7px" fontWeight="bold" textAnchor="middle" className="font-mono">
                        {team.capacityKg >= 1000 ? `${(team.capacityKg / 1000).toFixed(1)}t` : `${team.capacityKg}k`}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          )}

          {/* 7. VOLUNTEERS LAYER (Masked cluster points) */}
          {mapLayers.volunteers && (
            <g opacity="0.8">
              {mockVolunteers.map((vol) => {
                const { x, y } = projectCoords(vol.latitude, vol.longitude);
                
                // Color representing status
                let volColor = '#22c55e'; // Available (Green)
                if (vol.availability === 'busy') volColor = '#eab308'; // Busy (Yellow)
                if (vol.availability === 'offline') volColor = '#64748b'; // Offline (Gray)

                return (
                  <g key={`vol-dot-${vol.id}`} transform={`translate(${x}, ${y})`}>
                    <circle cx="0" cy="0" r="3.5" fill={volColor} stroke="#020617" strokeWidth="1" />
                  </g>
                );
              })}
            </g>
          )}
          </g>{/* end viewport transform group */}
        </svg>

        {/* 1. ROAD ACTION DRAWER (Pop-up inside center panel) */}
        {selectedEdge && (
          <div className="absolute top-4 left-4 w-[280px] bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs flex flex-col gap-2 z-20 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="font-bold text-slate-300 truncate max-w-[200px]">{selectedEdge.name}</span>
              <button 
                onClick={() => setSelectedEdge(null)}
                className="text-slate-500 hover:text-slate-300 font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">accessibility status</span>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <button
                  onClick={() => handleRoadStatusChange('open')}
                  className={`py-1 border rounded font-semibold cursor-pointer transition-colors ${
                    selectedEdge.status === 'open' 
                      ? 'bg-slate-900 border-slate-700 text-slate-200' 
                      : 'border-slate-850 hover:bg-slate-900 text-slate-500'
                  }`}
                >
                  Open (Gray)
                </button>
                <button
                  onClick={() => handleRoadStatusChange('slow')}
                  className={`py-1 border rounded font-semibold cursor-pointer transition-colors ${
                    selectedEdge.status === 'slow' 
                      ? 'bg-amber-950/60 border-amber-800 text-amber-300' 
                      : 'border-slate-850 hover:bg-slate-900 text-slate-500'
                  }`}
                >
                  Slow (Amber)
                </button>
                <button
                  onClick={() => handleRoadStatusChange('blocked')}
                  className={`py-1 border rounded font-semibold cursor-pointer transition-colors ${
                    selectedEdge.status === 'blocked' 
                      ? 'bg-red-950/60 border-red-800 text-red-300' 
                      : 'border-slate-850 hover:bg-slate-900 text-slate-500'
                  }`}
                >
                  Blocked (Dashed)
                </button>
                <button
                  onClick={() => handleRoadStatusChange('damaged')}
                  className={`py-1 border rounded font-semibold cursor-pointer transition-colors ${
                    selectedEdge.status === 'damaged' 
                      ? 'bg-red-950 border-red-800 text-red-200' 
                      : 'border-slate-850 hover:bg-slate-900 text-slate-500'
                  }`}
                >
                  Damaged (Thick)
                </button>
              </div>
            </div>

            <div className="space-y-1 mt-1">
              <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Obstruction Notes</label>
              <textarea
                value={roadNotes}
                onChange={(e) => setRoadNotes(e.target.value)}
                placeholder="Details of blockage..."
                className="w-full bg-slate-900 border border-slate-850 p-1.5 rounded text-[10.5px] text-slate-300 focus:outline-none focus:border-teal-500 resize-none h-12"
              />
            </div>

            <button
              onClick={() => {
                onUpdateRoadStatus(selectedEdge.id, selectedEdge.status, roadNotes);
                setSelectedEdge(null);
              }}
              className="w-full py-1.5 bg-teal-900 hover:bg-teal-850 border border-teal-800 text-teal-200 font-bold rounded transition-colors cursor-pointer"
            >
              Save Road Status
            </button>
          </div>
        )}

        {/* 2. FIELD REPORT DETAIL POPUP */}
        {selectedReport && (
          <div className="absolute top-4 left-4 w-[280px] bg-slate-950 border border-slate-800 p-3.5 rounded-lg text-xs flex flex-col gap-2 z-20 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-400" />
                <span className="font-bold text-slate-300 uppercase">Report #{selectedReport.id}</span>
              </div>
              <button 
                onClick={() => onSelectReport(null as any)}
                className="text-slate-500 hover:text-slate-300 font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Reporter: <strong className="text-slate-400">{selectedReport.reporterName}</strong></span>
                <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {new Date(selectedReport.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              <div className="bg-slate-900/60 border border-slate-850 p-2 rounded italic text-[11px] text-slate-300 leading-relaxed">
                "{selectedReport.rawText}"
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">Related Barangay</span>
                  <span className="text-slate-300 font-semibold">{selectedReport.barangayName || 'Unknown'}</span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">Confidence Score</span>
                  <span className="text-slate-300 font-semibold">{Math.round(selectedReport.confidence * 100)}%</span>
                </div>
              </div>
            </div>

            {selectedReport.status === 'pending' && (
              <div className="flex items-center gap-2 mt-1.5 pt-2 border-t border-slate-900">
                <button
                  onClick={() => {
                    onConfirmReport(selectedReport.id);
                    onSelectReport(null as any);
                  }}
                  className="flex-1 py-1.5 bg-teal-900 hover:bg-teal-850 border border-teal-800 text-teal-200 font-bold rounded flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
                >
                  <Check className="w-3 h-3" /> Confirm
                </button>
                <button
                  onClick={() => {
                    onFlagReport(selectedReport.id);
                    onSelectReport(null as any);
                  }}
                  className="px-2 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-red-400 font-bold rounded flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
                >
                  <AlertOctagon className="w-3 h-3" /> Flag
                </button>
              </div>
            )}
          </div>
        )}

        {/* 3. STATIC MAP LEGEND PANEL */}
        <div className="absolute bottom-4 right-4 bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-[9px] text-slate-400 flex flex-col gap-1.5 max-w-[150px] shadow-lg select-none">
          <div className="font-bold text-slate-300 border-b border-slate-800 pb-0.5 uppercase tracking-wide">Map Legend</div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#0d5c56] border border-slate-950"></span>
            <span>Normal (Dark Teal)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#d97706] border border-slate-950"></span>
            <span>Watch (Amber)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#dc2626] border border-slate-950"></span>
            <span>High Risk (Red)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#7f1d1d] border border-slate-950 animate-pulse"></span>
            <span>Critical Silence (Pulse)</span>
          </div>
          
          <div className="border-t border-slate-800 pt-1 flex flex-col gap-1.5 mt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#475569] inline-block"></span>
              <span>Road: Open</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#d97706] inline-block"></span>
              <span>Road: Slow</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t-2 border-dashed border-[#ef4444] inline-block"></span>
              <span>Road: Blocked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-1 border-t-[3px] border-dashed border-[#b91c1c] inline-block"></span>
              <span>Road: Damaged</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
