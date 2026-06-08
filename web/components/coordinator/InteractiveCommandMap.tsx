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

// ─── MapLibre types ──────────────────────────────────────────────────────────
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    maplibregl: any;
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
  scores: { barangayId: string; score: number; hoursSinceContact: number | null; timeFactor?: number; popDensityNorm?: number; hazardNorm?: number }[];
  onUpdateRoadStatus: (edgeId: string, status: 'open' | 'slow' | 'blocked' | 'damaged', notes?: string) => void;
  onConfirmReport: (reportId: string) => void;
  onFlagReport: (reportId: string) => void;
  onResetReports?: () => void;
}

// ─── Distance Helper (Haversine Formula) ──────────────────────────────────────
const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ─── Theme Helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.7) return '#7f1d1d';
  if (score >= 0.4) return '#dc2626';
  if (score >= 0.2) return '#d97706';
  return '#0d5c56';
}

function scoreBorderColor(score: number): string {
  if (score >= 0.7) return '#ef4444';
  if (score >= 0.4) return '#f97316';
  if (score >= 0.2) return '#f59e0b';
  return '#14b8a6';
}

function reportFillColor(source: string): string {
  if (source === 'sms')    return '#06b6d4';
  if (source === 'parsed') return '#a855f7';
  return '#0d9488';
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
  onResetReports,
}: InteractiveCommandMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  // Separate, isolated refs for markers
  const reportMarkersRef = useRef<any[]>([]);
  const teamMarkersRef = useRef<any[]>([]);
  const volunteerMarkersRef = useRef<any[]>([]);
  const hubMarkersRef = useRef<any[]>([]);

  // Tooltip popup reference
  const hoverPopupRef = useRef<any>(null);

  const maplibreLoadedRef = useRef(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [routeGeometries, setRouteGeometries] = useState<Record<string, [number, number][]>>({});
  const [roadGeometries, setRoadGeometries] = useState<Record<string, [number, number][]>>({}); // Store actual road paths
  const [selectedRoutePath, setSelectedRoutePath] = useState<[number, number][] | null>(null); // Dynamic path for selected report
  const [teamRouteGeometries, setTeamRouteGeometries] = useState<Record<string, [number, number][]>>({}); // OSRM-snapped per-team route paths

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
  const [legendOpen, setLegendOpen] = useState(false);
  const [hoveredBarangay, setHoveredBarangay] = useState<string | null>(null);

  // Keep refs of edges for dynamic access
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const getScoreData = useCallback(
    (barangayId: string) =>
      scores.find((s) => s.barangayId === barangayId) ??
      { barangayId, score: 0, hoursSinceContact: null, timeFactor: 1, popDensityNorm: 0, hazardNorm: 0 },
    [scores],
  );

  // Helper to find the nearest hub to a specific coordinate
  const getNearestHubToCoords = useCallback((lat: number, lng: number) => {
    let nearest = mockLocationHubs[0];
    let minDist = Infinity;
    mockLocationHubs.forEach((hub) => {
      const dist = calculateDistanceKm(lat, lng, hub.latitude, hub.longitude);
      if (dist < minDist) {
        minDist = dist;
        nearest = hub;
      }
    });
    return { hub: nearest, distance: minDist };
  }, []);

  // ── 1. Generate Barangay Polygons ─────────────────────────────────
  const generateBarangayPolygon = useCallback((barangay: Barangay): [number, number][] => {
    const centerLng = barangay.longitude;
    const centerLat = barangay.latitude;
    const size = 0.005; // Consistent size
    
    const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    const coords = angles.map(angle => {
      const rad = (angle * Math.PI) / 180;
      const latOffset = Math.sin(rad) * size;
      const lngOffset = Math.cos(rad) * size;
      return [centerLng + lngOffset, centerLat + latOffset] as [number, number];
    });
    
    coords.push(coords[0]);
    return coords;
  }, []);

  // ── 2. Fetch real road paths from OSRM ─────────────────────
  useEffect(() => {
    let active = true;
    const roadCache = new Map<string, [number, number][]>();

    const fetchRoadPaths = async () => {
      for (const edge of edges) {
        const cacheKey = `${edge.sourceCoords.lat},${edge.sourceCoords.lng}|${edge.targetCoords.lat},${edge.targetCoords.lng}`;
        
        if (roadCache.has(cacheKey)) {
          setRoadGeometries(prev => ({ ...prev, [edge.id]: roadCache.get(cacheKey)! }));
          continue;
        }

        await new Promise((resolve) => setTimeout(resolve, 150));

        try {
          const coords = `${edge.sourceCoords.lng},${edge.sourceCoords.lat};${edge.targetCoords.lng},${edge.targetCoords.lat}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);

          if (res.ok && active) {
            const data = await res.json();
            const geometry = data.routes?.[0]?.geometry?.coordinates;
            if (geometry?.length) {
              const simplified = geometry.filter((_: any, i: number) => i % 2 === 0 || i === geometry.length - 1);
              roadCache.set(cacheKey, simplified);
              setRoadGeometries(prev => ({ ...prev, [edge.id]: simplified }));
            } else {
              const straightLine = [
                [edge.sourceCoords.lng, edge.sourceCoords.lat],
                [edge.targetCoords.lng, edge.targetCoords.lat]
              ] as [number, number][];
              roadCache.set(cacheKey, straightLine);
              setRoadGeometries(prev => ({ ...prev, [edge.id]: straightLine }));
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch road path for ${edge.id}:`, error);
          const straightLine = [
            [edge.sourceCoords.lng, edge.sourceCoords.lat],
            [edge.targetCoords.lng, edge.targetCoords.lat]
          ] as [number, number][];
          roadCache.set(cacheKey, straightLine);
          setRoadGeometries(prev => ({ ...prev, [edge.id]: straightLine }));
        }
      }
    };

    fetchRoadPaths();
    return () => {
      active = false;
    };
  }, [edges]);

  // ── 3. Dynamic Route Generation to selected Report from Nearest Hub ──
  useEffect(() => {
    if (!selectedReport) {
      setSelectedRoutePath(null);
      return;
    }

    let active = true;
    const { hub } = getNearestHubToCoords(selectedReport.latitude, selectedReport.longitude);

    const fetchIncidentRoute = async () => {
      try {
        const correctCoords = `${hub.longitude},${hub.latitude};${selectedReport.longitude},${selectedReport.latitude}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${correctCoords}?overview=full&geometries=geojson`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (res.ok && active) {
          const data = await res.json();
          const geometry = data.routes?.[0]?.geometry?.coordinates;
          if (geometry?.length) {
            setSelectedRoutePath(geometry);
          } else {
            setSelectedRoutePath([
              [hub.longitude, hub.latitude],
              [selectedReport.longitude, selectedReport.latitude]
            ]);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch custom OSRM path to selected incident", e);
        if (active) {
          setSelectedRoutePath([
            [hub.longitude, hub.latitude],
            [selectedReport.longitude, selectedReport.latitude]
          ]);
        }
      }
    };

    fetchIncidentRoute();
    return () => {
      active = false;
    };
  }, [selectedReport, getNearestHubToCoords]);

  // ── Load MapLibre CSS + JS once ──────────────────────────────────────────
  useEffect(() => {
    if (maplibreLoadedRef.current) return;
    maplibreLoadedRef.current = true;

    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    if (!window.maplibregl) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.onload = () => initMap();
      document.head.appendChild(script);
    } else {
      initMap();
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resize Observer ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });

    resizeObserver.observe(mapContainerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [isMapLoaded]);

  // ── Map click handlers ──
  const handleRoadClick = useCallback((e: any) => {
    if (!e.features?.length) return;
    const feat = e.features[0];
    const edgeId = feat.properties.id;
    const edge = edgesRef.current.find((ed) => ed.id === edgeId);
    if (edge) {
      setSelectedEdge(edge);
      setRoadNotes(edge.notes ?? '');
      onSelectReport(null as unknown as FieldReport);
    }
  }, [onSelectReport]);

  const handleBarangayClick = useCallback((e: any) => {
    if (!e.features?.length) return;
    const feat = e.features[0];
    const barangayId = feat.properties.id;
    const barangay = barangays.find(b => b.id === barangayId);
    if (barangay) {
      onSelectBarangay(barangay);
      setSelectedEdge(null);
      mapRef.current?.flyTo({
        center: [barangay.longitude, barangay.latitude],
        zoom: 12.5,
        essential: true
      });
    }
  }, [barangays, onSelectBarangay]);

  // ── Initialize MapLibre ──
  const initMap = () => {
    const maplibregl = window.maplibregl;
    if (!mapContainerRef.current || mapRef.current || !maplibregl) return;

    const WHOLE_CEBU_BOUNDS: [[number, number], [number, number]] = [
      [123.15, 9.30], 
      [124.60, 11.50]
    ];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [123.905, 10.33], 
      zoom: 11.5,
      minZoom: 8.0,
      maxBounds: WHOLE_CEBU_BOUNDS,
      attributionControl: false,
    });

    hoverPopupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 15,
      className: 'command-map-tooltip'
    });

    map.on('load', () => {
      // Add sources
      map.addSource('barangays-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('roads-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('routes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Barangay layers
      map.addLayer({
        id: 'barangays-fill',
        type: 'fill',
        source: 'barangays-source',
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'id'], selectedBarangay?.id || ''],
            scoreBorderColor(getScoreData(selectedBarangay?.id || '').score),
            ['get', 'color']
          ],
          'fill-opacity': [
            'case',
            ['==', ['get', 'id'], hoveredBarangay || ''],
            0.6,
            ['==', ['get', 'id'], selectedBarangay?.id || ''],
            0.5,
            0.32
          ],
        },
      });

      map.addLayer({
        id: 'barangays-outline',
        type: 'line',
        source: 'barangays-source',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'id'], selectedBarangay?.id || ''],
            '#2dd4bf',
            '#475569'
          ],
          'line-width': [
            'case',
            ['==', ['get', 'id'], selectedBarangay?.id || ''],
            2,
            1
          ],
          'line-opacity': 0.6,
        },
      });

      map.addLayer({
        id: 'barangays-labels',
        type: 'symbol',
        source: 'barangays-source',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 10,
          'text-offset': [0, -0.5],
          'text-anchor': 'center',
        },
        paint: {
          'text-color': '#e2e8f0',
          'text-halo-color': '#0f172a',
          'text-halo-width': 1.5,
        },
      });

      // Road layers
      map.addLayer({
        id: 'roads-layer-solid',
        type: 'line',
        source: 'roads-source',
        filter: ['in', ['get', 'status'], ['literal', ['open', 'slow', 'damaged']]],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': [
            'match',
            ['get', 'status'],
            'slow', '#d97706',
            'damaged', '#dc2626',
            '#c3c4c5'
          ],
          'line-width': [
            'match',
            ['get', 'status'],
            'damaged', 4,
            3
          ],
          'line-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'roads-layer-blocked',
        type: 'line',
        source: 'roads-source',
        filter: ['==', ['get', 'status'], 'blocked'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ef4444',
          'line-width': 3,
          'line-dasharray': [4, 3],
          'line-opacity': 0.85,
        },
      });

      // Dynamic Teal Route Layers [1]
      map.addLayer({
        id: 'routes-layer-casing',
        type: 'line',
        source: 'routes-source',
        paint: {
          'line-color': '#083344', // Dark teal backing outline
          'line-width': 9,
          'line-opacity': 0.4,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': 'none'
        }
      });

      map.addLayer({
        id: 'routes-layer',
        type: 'line',
        source: 'routes-source',
        paint: {
          'line-color': '#0d9488', // Verified Teal
          'line-width': 5,
          'line-opacity': 0.95,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          'visibility': 'none'
        }
      });

      // ── Per-team OR-Tools route layers (always-on; distinct from the dynamic incident line) ──
      map.addSource('team-routes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'team-routes-casing',
        type: 'line',
        source: 'team-routes-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#020617', 'line-width': 7, 'line-opacity': 0.55 },
      });

      map.addLayer({
        id: 'team-routes-line',
        type: 'line',
        source: 'team-routes-source',
        filter: ['!=', ['get', 'status'], 'planned'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'status'], 'completed', '#64748b', '#2dd4bf'],
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });

      map.addLayer({
        id: 'team-routes-line-planned',
        type: 'line',
        source: 'team-routes-source',
        filter: ['==', ['get', 'status'], 'planned'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 3.5,
          'line-opacity': 0.85,
          'line-dasharray': [2, 1.6],
        },
      });

      // Per-team route hover: ETA + cargo summary + ordered stops popover
      const onTeamRouteHover = (e: any) => {
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features?.[0]?.properties;
        if (!p) return;
        const statusClass =
          p.status === 'active' ? 'text-teal-400 bg-teal-950/40'
          : p.status === 'completed' ? 'text-slate-400 bg-slate-800/50'
          : 'text-sky-400 bg-sky-950/40';
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="px-2 py-1 text-xs font-sans max-w-[240px]">
              <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-0.5 mb-1">
                <span class="font-bold text-teal-300">${p.teamName}</span>
                <span class="text-[8px] font-extrabold uppercase px-1 rounded ${statusClass}">${p.status}</span>
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                <div>ETA: <span class="text-slate-200 font-bold">${p.etaText}</span></div>
                <div>Dist: <span class="text-slate-200 font-bold">${p.distanceText}</span></div>
                <div class="col-span-2">Cargo: <span class="text-slate-200 font-semibold">${p.cargoText}</span></div>
              </div>
              <div class="mt-1 pt-1 border-t border-slate-800/70 text-[9.5px] text-slate-300">
                <div class="text-[8px] uppercase font-bold text-slate-500 mb-0.5">Ordered Stops</div>
                ${p.stopsText}
              </div>
            </div>
          `)
          .addTo(map);
      };
      const onTeamRouteLeave = () => {
        map.getCanvas().style.cursor = '';
        hoverPopupRef.current.remove();
      };
      ['team-routes-line', 'team-routes-line-planned'].forEach((lid) => {
        map.on('mouseenter', lid, onTeamRouteHover);
        map.on('mousemove', lid, (e: any) => hoverPopupRef.current.setLngLat(e.lngLat));
        map.on('mouseleave', lid, onTeamRouteLeave);
      });

      // Event handlers
      map.on('click', 'roads-layer-solid', handleRoadClick);
      map.on('click', 'roads-layer-blocked', handleRoadClick);
      map.on('click', 'barangays-fill', handleBarangayClick);
      map.on('click', 'barangays-outline', handleBarangayClick);

      // Hover effects
      map.on('mouseenter', 'barangays-fill', (e: any) => {
        if (e.features?.[0]?.properties?.id) {
          const feat = e.features[0];
          setHoveredBarangay(feat.properties.id);
          map.getCanvas().style.cursor = 'pointer';

          const p = feat.properties;
          const scorePct = Math.round(p.score * 100);
          const density = Number(p.popDensity).toLocaleString();
          const hazard = Number(p.hazardComposite).toFixed(2);
          const popN = Number(p.popDensityNorm).toFixed(2);
          const hazN = Number(p.hazardNorm).toFixed(2);
          const timeN = Number(p.timeFactor).toFixed(2);
          const contactStr =
            p.hoursSinceContact === null || p.hoursSinceContact === undefined || p.hoursSinceContact === ''
              ? 'No contact'
              : `${Math.round(Number(p.hoursSinceContact))}h ago`;
          const badgeClass =
            p.score >= 0.7 ? 'bg-red-950 text-red-300'
            : p.score >= 0.4 ? 'bg-red-900/50 text-red-300'
            : p.score >= 0.2 ? 'bg-amber-950 text-amber-300'
            : 'bg-teal-950 text-teal-300';

          // Close active hover windows to prevent overlapping states
          hoverPopupRef.current.remove();
          hoverPopupRef.current
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="px-2.5 py-1.5 text-xs font-sans w-[212px]">
                <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-1 mb-1">
                  <span class="font-bold text-teal-300">${p.name}</span>
                  <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded ${badgeClass}">${scorePct}%</span>
                </div>
                <div class="text-[8px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Silent Area Score Breakdown</div>
                <div class="space-y-1 text-[10px]">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-slate-400">Pop density</span>
                    <span><span class="text-slate-400">${density}/km²</span> · <span class="font-bold text-teal-300">${popN}</span></span>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-slate-400">Hazard exposure</span>
                    <span><span class="text-slate-400">${hazard}</span> · <span class="font-bold text-teal-300">${hazN}</span></span>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-slate-400">Since contact</span>
                    <span><span class="text-slate-400">${contactStr}</span> · <span class="font-bold text-teal-300">${timeN}</span></span>
                  </div>
                </div>
                <div class="mt-1.5 pt-1 border-t border-slate-800/70 text-[9px] text-slate-500 text-center font-mono">
                  ${popN} × ${hazN} × ${timeN} = <span class="text-slate-300 font-bold">${Number(p.score).toFixed(2)}</span>
                </div>
              </div>
            `)
            .addTo(map);
        }
      });
      
      map.on('mousemove', 'barangays-fill', (e: any) => {
        hoverPopupRef.current.setLngLat(e.lngLat);
      });

      map.on('mouseleave', 'barangays-fill', () => {
        setHoveredBarangay(null);
        map.getCanvas().style.cursor = '';
        hoverPopupRef.current.remove();
      });

      // Road hover interactive swell effect + tooltip
      const onRoadHover = (e: any) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features?.[0]?.properties;
        if (props) {
          map.setPaintProperty('roads-layer-solid', 'line-width', [
            'case',
            ['==', ['get', 'id'], props.id],
            5.5,
            ['match', ['get', 'status'], 'damaged', 4, 3]
          ]);
          map.setPaintProperty('roads-layer-solid', 'line-opacity', [
            'case',
            ['==', ['get', 'id'], props.id],
            1.0,
            0.6
          ]);

          // Close active hover windows to prevent overlapping states
          hoverPopupRef.current.remove();
          hoverPopupRef.current
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="px-2 py-1 text-xs font-sans">
                <div class="font-bold text-slate-100">${props.name}</div>
                <div class="text-[10px] mt-0.5 capitalize">Status: <span class="font-bold text-slate-300">${props.status}</span></div>
              </div>
            `)
            .addTo(map);
        }
      };

      const onRoadLeave = () => {
        map.getCanvas().style.cursor = '';
        hoverPopupRef.current.remove();
        map.setPaintProperty('roads-layer-solid', 'line-width', [
          'match', ['get', 'status'], 'damaged', 4, 3
        ]);
        map.setPaintProperty('roads-layer-solid', 'line-opacity', 0.85);
      };

      map.on('mouseenter', 'roads-layer-solid', onRoadHover);
      map.on('mousemove', 'roads-layer-solid', (e: { lngLat: any; }) => hoverPopupRef.current.setLngLat(e.lngLat));
      map.on('mouseleave', 'roads-layer-solid', onRoadLeave);

      map.on('mouseenter', 'roads-layer-blocked', onRoadHover);
      map.on('mousemove', 'roads-layer-blocked', (e: { lngLat: any; }) => hoverPopupRef.current.setLngLat(e.lngLat));
      map.on('mouseleave', 'roads-layer-blocked', onRoadLeave);

      mapRef.current = map;
      setIsMapLoaded(true);

      setTimeout(() => map.resize(), 100);
    });
  };

  // ── Update Barangay Polygons ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const barangaysSource = map.getSource('barangays-source');
    if (barangaysSource && mapLayers.barangays) {
      const features = barangays.map(barangay => {
        const sd = getScoreData(barangay.id);
        const color = scoreColor(sd.score);

        return {
          type: 'Feature',
          properties: {
            id: barangay.id,
            name: barangay.name,
            score: sd.score,
            hoursSinceContact: sd.hoursSinceContact,
            color: color,
            // Silent Area score components (for the hover breakdown tooltip)
            popDensity: barangay.popDensity,
            hazardComposite: barangay.hazardComposite,
            popDensityNorm: sd.popDensityNorm ?? 0,
            hazardNorm: sd.hazardNorm ?? 0,
            timeFactor: sd.timeFactor ?? 1,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [generateBarangayPolygon(barangay)]
          }
        };
      });
      
      barangaysSource.setData({
        type: 'FeatureCollection',
        features: features
      });
    }
  }, [isMapLoaded, mapLayers.barangays, barangays, getScoreData, generateBarangayPolygon, selectedBarangay, hoveredBarangay]);

  // ── Road network rendering (All roads remain visible) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const roadsSource = map.getSource('roads-source');
    if (roadsSource && mapLayers.roads) {
      const features = edges.map((edge) => {
        // Always render: use OSRM-snapped geometry when available, else a straight
        // line between endpoints. Guards against in-flight fetches, OSRM 429
        // rate-limits, and the demo server being offline (no edge ever disappears).
        const geometry = roadGeometries[edge.id] ?? [
          [edge.sourceCoords.lng, edge.sourceCoords.lat],
          [edge.targetCoords.lng, edge.targetCoords.lat],
        ];

        return {
          type: 'Feature',
          properties: {
            id: edge.id,
            name: edge.name,
            status: edge.status,
          },
          geometry: {
            type: 'LineString',
            coordinates: geometry
          }
        };
      }).filter(Boolean);
      
      roadsSource.setData({
        type: 'FeatureCollection',
        features: features
      });
    }
  }, [isMapLoaded, mapLayers.roads, edges, roadGeometries]);

  // ── Active Teal Route Rendering ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const routesSource = map.getSource('routes-source');
    if (routesSource) {
      if (mapLayers.routes && selectedRoutePath) {
        routesSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { status: 'active' },
              geometry: {
                type: 'LineString',
                coordinates: selectedRoutePath
              }
            }
          ]
        });
        map.setLayoutProperty('routes-layer', 'visibility', 'visible');
        map.setLayoutProperty('routes-layer-casing', 'visibility', 'visible');
      } else {
        routesSource.setData({
          type: 'FeatureCollection',
          features: []
        });
        if (map.getLayer('routes-layer')) {
          map.setLayoutProperty('routes-layer', 'visibility', 'none');
          map.setLayoutProperty('routes-layer-casing', 'visibility', 'none');
        }
      }
    }
  }, [isMapLoaded, mapLayers.routes, selectedRoutePath]);

  // ── OSRM-snap per-team OR-Tools routes onto real roads (waypoints: team base -> ordered stops) ──
  useEffect(() => {
    let active = true;

    const fetchTeamRoutes = async () => {
      for (const route of routes) {
        const team = teams.find((t) => t.id === route.teamId);
        const stopCoords = route.stops
          .map((s) => barangays.find((b) => b.id === s.barangayId))
          .filter(Boolean)
          .map((b) => ({ lat: (b as Barangay).latitude, lng: (b as Barangay).longitude }));

        const waypoints = [
          team ? { lat: team.baseLocation.lat, lng: team.baseLocation.lng } : stopCoords[0],
          ...stopCoords,
        ].filter(Boolean) as { lat: number; lng: number }[];

        if (waypoints.length < 2) continue;

        await new Promise((resolve) => setTimeout(resolve, 200));

        let geometry: [number, number][] | null = null;
        try {
          const coordStr = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`,
            { signal: controller.signal },
          );
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            const geom = data.routes?.[0]?.geometry?.coordinates;
            if (geom?.length) geometry = geom;
          }
        } catch (e) {
          console.warn(`Failed to OSRM-snap team route ${route.id}:`, e);
        }

        // Fallback to the precomputed curved path so a polyline always renders
        if (!geometry) geometry = route.path.map((p) => [p.lng, p.lat] as [number, number]);

        if (!active) return;
        setTeamRouteGeometries((prev) => ({ ...prev, [route.id]: geometry! }));
      }
    };

    fetchTeamRoutes();
    return () => {
      active = false;
    };
  }, [routes, teams, barangays]);

  // ── Per-team route rendering (polylines + ETA + cargo summary popover) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const src = map.getSource('team-routes-source');
    if (!src) return;

    if (!mapLayers.routes) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const AVG_SPEED_KMH = 25; // disaster-response convoy avg over degraded roads

    const features = routes.map((route) => {
      const team = teams.find((t) => t.id === route.teamId);
      const distanceKm = route.totalDistanceM / 1000;
      const etaMin = Math.round((distanceKm / AVG_SPEED_KMH) * 60);
      const etaText = etaMin >= 60 ? `${Math.floor(etaMin / 60)}h ${etaMin % 60}m` : `${etaMin} min`;
      const cargoText = team ? `${team.capacityKg.toLocaleString()} kg · ${team.type}` : 'Unassigned';
      const stopsText = route.stops
        .map(
          (s) =>
            `<div class="leading-snug"><span class="text-teal-400 font-bold">${s.sequence}.</span> ${s.barangayName} <span class="text-slate-500">— ${s.action}</span></div>`,
        )
        .join('');

      const coordinates =
        teamRouteGeometries[route.id] ?? route.path.map((p) => [p.lng, p.lat] as [number, number]);

      return {
        type: 'Feature',
        properties: {
          id: route.id,
          teamName: route.teamName,
          status: route.status,
          etaText,
          distanceText: `${distanceKm.toFixed(1)} km`,
          cargoText,
          stopsText,
        },
        geometry: { type: 'LineString', coordinates },
      };
    });

    src.setData({ type: 'FeatureCollection', features });
  }, [isMapLoaded, mapLayers.routes, routes, teams, teamRouteGeometries]);

  // ── Interactive Report Markers (Custom SVG styling for Pending/Confirmed/Flagged) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    reportMarkersRef.current.forEach((m) => m.remove());
    reportMarkersRef.current = [];

    if (!mapLayers.reports) return;

    reports.forEach((report) => {
      const fill = reportFillColor(report.source);
      const isSelected = selectedReport?.id === report.id;
      const status = report.status;

      const el = document.createElement('div');
      el.className = 'flex items-center justify-center relative cursor-pointer group';
      
      const size = isSelected ? 32 : 25;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;

      let bg = fill;
      let border = '2px solid #ffffff';
      let iconMarkup = '';
      let pulseClass = '';

      if (status === 'pending') {
        bg = '#d97706'; // Enforce solid warning yellow background [1]
        border = '2px solid #fbbf24'; // Warning yellow borders [1]
        pulseClass = 'marker-pulse'; // applied directly to inner div [1.1.7]
        el.style.setProperty('--pulse-color', '#fbbf24'); // Yellow pulse glow [1]
        
        // Exclamation point (!) matching the legend exactly [1]
        iconMarkup = `
          <span style="color: #ffffff; font-size: 12px; font-weight: 900; font-family: sans-serif; line-height: 1; margin-top: -1px;">
            !
          </span>
        `;
      } else if (status === 'confirmed') {
        bg = '#16a34a'; // Verified Forest Green
        border = '2px solid #22c55e';
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
      } else if (status === 'flagged') {
        bg = '#dc2626'; // Alert Crimson
        border = '2.5px solid #ef4444';
        // Flag icon replacing previous close/X [1]
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
        `;
      }

      el.innerHTML = `
        <div style="
          background: ${bg};
          border: ${border};
          border-radius: 50%;
          width: ${size}px;
          height: ${size}px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
          transition: transform 0.2s ease, width 0.2s ease, height 0.2s ease;
        " class="hover:scale-125 ${pulseClass}">
          ${iconMarkup}
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        const statusLabelColor = status === 'confirmed' ? 'text-green-400 bg-green-950/40' :
          status === 'flagged' ? 'text-red-400 bg-red-950/40' : 'text-amber-400 bg-amber-950/40';

        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat([report.longitude, report.latitude])
          .setHTML(`
            <div class="px-2 py-1 text-xs font-sans">
              <div class="flex items-center gap-1.5 mb-0.5 border-b border-slate-800 pb-0.5 justify-between">
                <span class="font-bold text-slate-100 uppercase text-[9px] tracking-wide">Report #${report.id}</span>
                <span class="text-[9px] font-extrabold uppercase px-1 rounded-sm ${statusLabelColor}">${status}</span>
              </div>
              <div class="text-slate-300 font-medium mb-1 line-clamp-2 max-w-[200px]">"${report.rawText}"</div>
              <div class="text-[9px] text-slate-500">Source: <span class="text-teal-400 uppercase font-bold">${report.source}</span></div>
            </div>
          `)
          .addTo(map);
      });

      el.addEventListener('mouseleave', () => {
        hoverPopupRef.current.remove();
      });

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onSelectReport(report);
        setSelectedEdge(null);
        map.flyTo({
          center: [report.longitude, report.latitude],
          zoom: 13.2,
          essential: true,
          speed: 1.2
        });
      });

      const marker = new window.maplibregl.Marker({ element: el })
        .setLngLat([report.longitude, report.latitude])
        .addTo(map);

      reportMarkersRef.current.push(marker);
    });
  }, [isMapLoaded, mapLayers.reports, reports, selectedReport, onSelectReport]);

  // ── Interactive Team Markers (Custom SVGs categorized by Team Type) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    teamMarkersRef.current.forEach((m) => m.remove());
    teamMarkersRef.current = [];

    if (!mapLayers.teams) return;

    teams.forEach((team) => {
      const label = team.capacityKg >= 1000
        ? `${(team.capacityKg / 1000).toFixed(1)}t`
        : `${team.capacityKg}k`;

      const el = document.createElement('div');
      el.className = 'cursor-pointer flex flex-col items-center';

      let iconColor = '#38bdf8'; 
      let iconMarkup = '';

      if (team.type === 'boat') {
        iconColor = '#34d399'; 
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v17M2 10c0 4.4 3.6 8 10 8s10-3.6 10-8H2z"/>
          </svg>
        `;
      } else if (team.type === 'ambulance') {
        iconColor = '#f43f5e'; 
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        `;
      } else if (team.type === '4x4') {
        iconColor = '#fbbf24'; 
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18.5" cy="17.5" r="2.5"/>
            <circle cx="5.5" cy="17.5" r="2.5"/>
            <path d="M14 6H5a2 2 0 0 0-2 2v6h18v-3a3 3 0 0 0-3-3h-4Z"/>
          </svg>
        `;
      } else {
        iconColor = '#38bdf8'; 
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="15" height="13" rx="2" ry="2"/>
            <polygon points="16 8 20 8 23 11 23 16 16 16"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
        `;
      }
      
      el.innerHTML = `
        <div style="
          background: #1e293b;
          border: 1.5px solid #64748b;
          border-radius: 6px;
          padding: 3px 5px;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.5);
          transition: border-color 0.15s;
        " class="hover:border-teal-400">
          ${iconMarkup}
          <span style="color: #cbd5e1; font-size: 8.5px; font-weight: 700; font-family: monospace;">${label}</span>
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat([team.baseLocation.lng + 0.005, team.baseLocation.lat + 0.005])
          .setHTML(`
            <div class="px-2 py-1 text-xs font-sans">
              <div class="font-bold text-sky-400 mb-0.5">${team.name}</div>
              <div class="text-[10px] text-slate-400">Type: <span class="text-slate-200 font-semibold uppercase">${team.type}</span></div>
              <div class="text-[10px] text-slate-400">Status: <span class="text-slate-200 font-semibold capitalize">${team.status}</span></div>
              <div class="text-[10px] text-slate-400">Capacity: <span class="text-slate-200 font-semibold">${team.capacityKg.toLocaleString()} kg</span></div>
            </div>
          `)
          .addTo(map);
      });

      el.addEventListener('mouseleave', () => {
        hoverPopupRef.current.remove();
      });

      const marker = new window.maplibregl.Marker({ element: el })
        .setLngLat([team.baseLocation.lng + 0.005, team.baseLocation.lat + 0.005])
        .addTo(map);

      teamMarkersRef.current.push(marker);
    });
  }, [isMapLoaded, mapLayers.teams, teams]);

  // ── Interactive Volunteer Markers (Custom User SVG + Tooltip) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    volunteerMarkersRef.current.forEach((m) => m.remove());
    volunteerMarkersRef.current = [];

    if (!mapLayers.volunteers) return;

    mockVolunteers.forEach((vol) => {
      const fill = volColor(vol.availability);
      const el = document.createElement('div');
      el.className = 'cursor-pointer';
      
      el.innerHTML = `
        <div style="
          background: #0f172a;
          border: 1.5px solid ${fill};
          border-radius: 50%;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(0,0,0,0.6);
          transition: transform 0.15s;
        " class="hover:scale-125">
          <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="${fill}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat([vol.longitude, vol.latitude])
          .setHTML(`
            <div class="px-2 py-1 text-xs font-sans">
              <div class="font-bold text-slate-100 mb-0.5">${vol.name}</div>
              <div class="text-[10px] text-slate-400">Team: <span class="text-slate-200">${vol.teamName || 'Independent'}</span></div>
              <div class="text-[10px] uppercase font-semibold tracking-wider flex items-center gap-1 mt-0.5" style="color: ${fill}">
                <span class="w-1.5 h-1.5 rounded-full" style="background: ${fill}"></span>
                ${vol.availability}
              </div>
            </div>
          `)
          .addTo(map);
      });

      el.addEventListener('mouseleave', () => {
        hoverPopupRef.current.remove();
      });

      const marker = new window.maplibregl.Marker({ element: el })
        .setLngLat([vol.longitude, vol.latitude])
        .addTo(map);

      volunteerMarkersRef.current.push(marker);
    });
  }, [isMapLoaded, mapLayers.volunteers]);

  // ── Interactive Hub Markers (SVGs categorized by Hub Type) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    hubMarkersRef.current.forEach((m) => m.remove());
    hubMarkersRef.current = [];

    if (!mapLayers.hubs) return;

    mockLocationHubs.forEach((hub) => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer';
      
      let hubColor = '#0284c7'; 
      let iconMarkup = '';

      if (hub.type === 'shelter') {
        hubColor = '#f97316'; 
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        `;
      } else if (hub.type === 'supply_hub') {
        hubColor = '#a855f7'; 
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
            <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
          </svg>
        `;
      } else {
        // Warehouse (Large Depot)
        hubColor = '#0284c7'; 
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 10v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10l10-6 10 6Z"/>
            <path d="M6 12h12v10H6z"/>
          </svg>
        `;
      }

      el.innerHTML = `
        <div style="
          background: ${hubColor};
          border: 1.5px solid #ffffff;
          border-radius: 4px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 8px rgba(0,0,0,0.6);
          transition: transform 0.15s;
        " class="hover:scale-110">
          ${iconMarkup}
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat([hub.longitude, hub.latitude])
          .setHTML(`
            <div class="px-2 py-1 text-xs font-sans">
              <div class="font-bold text-sky-400 mb-0.5">${hub.name}</div>
              <div class="text-[9px] text-slate-400 uppercase tracking-wider font-semibold capitalize">Type: ${hub.type.replace('_', ' ')}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">Capacity Used: <span class="font-bold text-slate-200">${hub.capacityPercent}%</span></div>
            </div>
          `)
          .addTo(map);
      });

      el.addEventListener('mouseleave', () => {
        hoverPopupRef.current.remove();
      });

      const marker = new window.maplibregl.Marker({ element: el })
        .setLngLat([hub.longitude, hub.latitude])
        .addTo(map);

      hubMarkersRef.current.push(marker);
    });
  }, [isMapLoaded, mapLayers.hubs]);

  // ── Sync layer visibility ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const toggleLayer = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };

    toggleLayer('barangays-fill', mapLayers.barangays);
    toggleLayer('barangays-outline', mapLayers.barangays);
    toggleLayer('barangays-labels', mapLayers.barangays);
    toggleLayer('roads-layer-solid', mapLayers.roads);
    toggleLayer('roads-layer-blocked', mapLayers.roads);
    toggleLayer('team-routes-casing', mapLayers.routes);
    toggleLayer('team-routes-line', mapLayers.routes);
    toggleLayer('team-routes-line-planned', mapLayers.routes);
  }, [mapLayers, isMapLoaded]);

  // ── Fullscreen Setup ──
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
    const timer = setTimeout(() => mapRef.current?.resize(), 200);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  // ── Zoom helpers ──
  const zoomIn    = () => mapRef.current?.zoomIn();
  const zoomOut   = () => mapRef.current?.zoomOut();
  const resetView = () => mapRef.current?.easeTo({ center: [123.905, 10.33], zoom: 11.5 });

  // ── Road status update ──
  const handleRoadStatusChange = (status: 'open' | 'slow' | 'blocked' | 'damaged') => {
    if (!selectedEdge) return;
    onUpdateRoadStatus(selectedEdge.id, status, roadNotes);
    setSelectedEdge((prev) => (prev ? { ...prev, status, notes: roadNotes } : null));
  };

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
      <style>{`
        .map-container {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
        }
        /* Critical positioning fix for MapLibre markers and popups */
        .maplibregl-marker {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          will-change: transform !important;
        }
        .maplibregl-popup {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          will-change: transform !important;
          display: flex !important;
        }
        /* Pulse Animation for urgent items */
        @keyframes marker-glow-pulse {
          0%, 100% {
            transform: scale(1);
            filter: drop-shadow(0 0 2px var(--pulse-color));
          }
          50% {
            transform: scale(1.15);
            filter: drop-shadow(0 0 8px var(--pulse-color));
          }
        }
        .marker-pulse {
          animation: marker-glow-pulse 2s infinite ease-in-out;
        }
        /* Custom Tooltip Styling */
        .command-map-tooltip .maplibregl-popup-content {
          background-color: #020617 !important;
          color: #f1f5f9 !important;
          border: 1px solid #1e293b !important;
          border-radius: 8px !important;
          padding: 6px 10px !important;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.7) !important;
        }
        .command-map-tooltip .maplibregl-popup-tip {
          border-top-color: #020617 !important;
          border-bottom-color: #020617 !important;
        }
      `}</style>

      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center justify-between z-10 select-none">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-teal-400" />
          <span className="font-bold text-[11px] uppercase tracking-wider text-slate-300">
            Live Operations Map
          </span>
          {onResetReports && (
            <button
              onClick={() => {
                onResetReports();
                onSelectReport(null as any);
                setSelectedEdge(null);
              }}
              className="ml-2 px-2 py-0.5 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-[8px] font-bold rounded uppercase tracking-wider transition-colors cursor-pointer"
            >
              Reset States
            </button>
          )}
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

      {/* Map area */}
      <div className="flex-1 relative overflow-hidden">
        <div ref={mapContainerRef} className="map-container" />

        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          className="absolute top-3 left-3 z-10 w-7 h-7 bg-slate-900/90 border border-slate-700 hover:border-teal-600 text-slate-300 hover:text-teal-300 rounded flex items-center justify-center cursor-pointer transition-colors select-none backdrop-blur-sm"
        >
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>
          )}
        </button>

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
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

        {/* Road edge popup (Adjusted left position to sit right beside the top-left fullscreen icon) */}
        {selectedEdge && (
          <div className="absolute top-3 left-12 w-[290px] bg-slate-950/95 border border-slate-800 p-3.5 rounded-lg text-xs flex flex-col gap-2 z-10 shadow-2xl backdrop-blur-sm">
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
                    open: 'Open', slow: 'Slow',
                    blocked: 'Blocked', damaged: 'Damaged',
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
                Notes
              </label>
              <textarea
                value={roadNotes}
                onChange={(e) => setRoadNotes(e.target.value)}
                placeholder="Additional details..."
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
              Save Status
            </button>
          </div>
        )}

        {/* Report popup (Adjusted left position to sit right beside the top-left fullscreen icon) */}
        {selectedReport && (
          <div className="absolute top-3 left-12 w-[300px] bg-slate-950/95 border border-slate-800 p-3.5 rounded-lg text-xs flex flex-col gap-2 z-10 shadow-2xl backdrop-blur-sm">
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

              {/* Enhanced details panel matching our updated mock schema */}
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 border-b border-slate-900 pb-2">
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">
                    Barangay
                  </span>
                  <span className="text-slate-300 font-semibold">
                    {selectedReport.barangayName ?? 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">
                    Severity / Need
                  </span>
                  <span className={`font-semibold uppercase tracking-wide text-[9px] ${
                    selectedReport.needsSeverity === 'critical' ? 'text-red-400' :
                    selectedReport.needsSeverity === 'high' ? 'text-amber-400' :
                    selectedReport.needsSeverity === 'medium' ? 'text-sky-400' : 'text-slate-400'
                  }`}>
                    {selectedReport.needsSeverity}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">
                    Est. Affected
                  </span>
                  <span className="text-slate-300 font-semibold">
                    {selectedReport.populationEstimate > 0 ? `${selectedReport.populationEstimate} people` : 'None / Minor'}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px] uppercase font-bold text-slate-500">
                    Impediment
                  </span>
                  <span className="text-slate-300 font-semibold">
                    {selectedReport.roadImpassable ? 'Impassable St' : selectedReport.roadStatus || 'None'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">Confidence Score:</span>
                <span className="text-slate-300 font-semibold">{Math.round(selectedReport.confidence * 100)}%</span>
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">Verification Status:</span>
                <span className={`font-bold uppercase text-[9px] px-1.5 py-0.5 rounded ${
                  selectedReport.status === 'confirmed' ? 'bg-green-950 text-green-400 border border-green-800' :
                  selectedReport.status === 'flagged' ? 'bg-red-950 text-red-400 border border-red-800' :
                  'bg-yellow-950 text-yellow-400 border border-yellow-800'
                }`}>
                  {selectedReport.status}
                </span>
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

        {/* Updated Legend Panel (Hub colors explicit to display the 3 distinct types) */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1.5 select-none">
          {legendOpen && (
            <div className="bg-slate-950/95 border border-slate-800 p-3 rounded-lg text-[9.5px] text-slate-400 flex flex-col gap-2.5 w-[140px] shadow-2xl backdrop-blur-sm">
              <div>
                <div className="font-bold text-[8px] text-slate-500 uppercase tracking-wider mb-1">Barangay Risk</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { color: '#0d5c56', label: 'Normal' },
                    { color: '#d97706', label: 'Watch' },
                    { color: '#dc2626', label: 'High' },
                    { color: '#7f1d1d', label: 'Critical' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-[8.5px]">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-850 pt-1.5">
                <div className="font-bold text-[8px] text-slate-500 uppercase tracking-wider mb-1">Road Network</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-[#475569] inline-block shrink-0" />
                    <span>Open Access</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-[#d97706] inline-block shrink-0" />
                    <span>Slow Route</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t-2 border-dashed border-[#ef4444] inline-block shrink-0" />
                    <span>Blocked Way</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-[#dc2626] inline-block shrink-0" />
                    <span>Damaged Path</span>
                  </div>
                  <div className="text-[7.5px] text-slate-500 italic mt-1 leading-normal">
                    *Incident line generates dynamically between nearest hub and the selected report.
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-850 pt-1.5">
                <div className="font-bold text-[8px] text-slate-500 uppercase tracking-wider mb-1">Mission Routes (OR-Tools)</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-[#2dd4bf] inline-block shrink-0" />
                    <span>Active dispatch</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0 border-t-2 border-dashed border-[#38bdf8] inline-block shrink-0" />
                    <span>Planned route</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-[#64748b] inline-block shrink-0" />
                    <span>Completed</span>
                  </div>
                  <div className="text-[7.5px] text-slate-500 italic mt-1 leading-normal">
                    *Hover a route for ETA, cargo &amp; ordered stops.
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-850 pt-1.5">
                <div className="font-bold text-[8px] text-slate-500 uppercase tracking-wider mb-1">Report States</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-[7px] text-amber-500 shrink-0 font-bold">!</span>
                    <span>Pending Action</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-green-600 border border-green-400 flex items-center justify-center text-[7px] text-white shrink-0 font-bold">✓</span>
                    <span>Verified</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-red-600 border border-red-400 flex items-center justify-center text-[7px] text-white shrink-0 font-bold">✕</span>
                    <span>Flagged</span>
                  </div>
                </div>
              </div>

              {/* Asset Types split cleanly into specific operational categories */}
              <div className="border-t border-slate-850 pt-1.5">
                <div className="font-bold text-[8px] text-slate-500 uppercase tracking-wider mb-1">Asset Types</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[8.5px]">
                    <span className="w-2.5 h-2 bg-[#0284c7] border border-sky-400 rounded-sm inline-block shrink-0" />
                    <span>Warehouse / Depot</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[8.5px]">
                    <span className="w-2.5 h-2 bg-[#a855f7] border border-purple-400 rounded-sm inline-block shrink-0" />
                    <span>Supply Hub</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[8.5px]">
                    <span className="w-2.5 h-2 bg-[#f97316] border border-orange-400 rounded-sm inline-block shrink-0" />
                    <span>Emergency Shelter</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[8.5px] border-t border-slate-900 pt-1 mt-1">
                    <span className="w-2.5 h-1.5 bg-slate-850 border border-slate-500 inline-block shrink-0" />
                    <span>Rescue Team</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setLegendOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/95 border border-slate-700 hover:border-teal-600 text-slate-400 hover:text-teal-300 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors backdrop-blur-sm shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M3 12h1m16 0h1M12 3v1m0 16v1m-6.4-3.6.7-.7m11.4-11.4.7-.7M5.6 5.6l.7.7m11.4 11.4.7.7"/>
            </svg>
            Legend Panel
            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: legendOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}