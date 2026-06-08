'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Compass,
  FileText,
  Clock,
  Check,
  AlertOctagon,
  X,
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
import { COLOR, silentAreaState, STATE_COLOR, STATE_LABEL } from './ui';
import 'maplibre-gl/dist/maplibre-gl.css';

// Neutral linework tones for the calm basemap (roads default off).
const ROAD_OPEN = '#52607a';
const ROUTE_ACTIVE = '#9fb0cc';
const ROUTE_PLANNED = '#5d6a86';
const ROUTE_DONE = '#46506a';
const ROUTE_CASING = '#0b1120';
const BARANGAY_OUTLINE = '#3a4660';

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
  active?: boolean;
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

// ─── Theme Helpers (calm tokens: reached / escalating / critical) ─────────────

// Silent Area pin state → color. White-ish = reached, amber = escalating,
// red = critical (the three Phase 3.1 states).
function scoreColor(score: number): string {
  return STATE_COLOR[silentAreaState(score)];
}

function reportStatusColor(status: string): string {
  if (status === 'confirmed') return COLOR.active;
  if (status === 'flagged') return COLOR.critical;
  return COLOR.warning; // pending
}

function volColor(availability: string): string {
  if (availability === 'busy')    return COLOR.warning;
  if (availability === 'offline') return COLOR.muted;
  return COLOR.active;
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
  active = true,
}: InteractiveCommandMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maplibreglRef = useRef<any>(null); // npm maplibre-gl module (client-only dynamic import)

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

  // Minimal default: barangay risk + active routes + reports. Roads, teams,
  // volunteers, and hubs are off until the operator opts in via the layers control.
  const [mapLayers, setMapLayers] = useState({
    barangays: true,
    roads: false,
    reports: true,
    routes: true,
    teams: false,
    volunteers: false,
    hubs: false,
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

  // ── Load MapLibre from npm (client-only dynamic import) once ─────────────
  useEffect(() => {
    if (maplibreLoadedRef.current) return;
    maplibreLoadedRef.current = true;

    let cancelled = false;
    import('maplibre-gl').then((mod) => {
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maplibreglRef.current = (mod as any).default ?? mod;
      initMap();
    });

    return () => {
      cancelled = true;
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

  // When this tab becomes active again, its container went display:none -> visible.
  // Resize so MapLibre repaints the canvas at the correct size (the map stays
  // mounted across tabs, so it is never re-created).
  useEffect(() => {
    if (!active || !mapRef.current) return;
    const raf = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(raf);
  }, [active, isMapLoaded]);

  // Recentre when a barangay/report is selected from outside the map (e.g. the
  // Operations panel queue) — map clicks already fly on their own.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;
    if (selectedReport) {
      map.flyTo({ center: [selectedReport.longitude, selectedReport.latitude], zoom: 13.2, essential: true });
    } else if (selectedBarangay) {
      map.flyTo({ center: [selectedBarangay.longitude, selectedBarangay.latitude], zoom: 12.5, essential: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarangay?.id, selectedReport?.id, isMapLoaded]);

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
    const maplibregl = maplibreglRef.current;
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
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case',
            ['==', ['get', 'id'], hoveredBarangay || ''],
            0.42,
            ['==', ['get', 'id'], selectedBarangay?.id || ''],
            0.4,
            0.22
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
            COLOR.fg,
            BARANGAY_OUTLINE
          ],
          'line-width': [
            'case',
            ['==', ['get', 'id'], selectedBarangay?.id || ''],
            2,
            1
          ],
          'line-opacity': 0.7,
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
            'slow', COLOR.warning,
            'damaged', COLOR.critical,
            ROAD_OPEN
          ],
          'line-width': [
            'match',
            ['get', 'status'],
            'damaged', 3.5,
            2.5
          ],
          'line-opacity': 0.7,
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
          'line-color': COLOR.critical,
          'line-width': 2.5,
          'line-dasharray': [4, 3],
          'line-opacity': 0.75,
        },
      });

      // Dynamic incident line (nearest hub -> selected report)
      map.addLayer({
        id: 'routes-layer-casing',
        type: 'line',
        source: 'routes-source',
        paint: {
          'line-color': ROUTE_CASING,
          'line-width': 8,
          'line-opacity': 0.5,
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
          'line-color': ROUTE_ACTIVE,
          'line-width': 4,
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
        paint: { 'line-color': ROUTE_CASING, 'line-width': 6, 'line-opacity': 0.5 },
      });

      map.addLayer({
        id: 'team-routes-line',
        type: 'line',
        source: 'team-routes-source',
        filter: ['!=', ['get', 'status'], 'planned'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'status'], 'completed', ROUTE_DONE, ROUTE_ACTIVE],
          'line-width': 3.5,
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
          'line-color': ROUTE_PLANNED,
          'line-width': 3,
          'line-opacity': 0.85,
          'line-dasharray': [2, 1.6],
        },
      });

      // Per-team route hover: ETA + cargo summary + ordered stops popover
      const onTeamRouteHover = (e: any) => {
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features?.[0]?.properties;
        if (!p) return;
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="px-2 py-1 text-[13px] font-sans max-w-[240px]">
              <div class="flex items-center justify-between gap-2 border-b border-line pb-1 mb-1.5">
                <span class="font-medium text-fg">${p.teamName}</span>
                <span class="text-[12px] text-muted capitalize">${p.status}</span>
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-muted">
                <div>ETA <span class="text-fg font-mono tabular-nums">${p.etaText}</span></div>
                <div>Dist <span class="text-fg font-mono tabular-nums">${p.distanceText}</span></div>
                <div class="col-span-2">Cargo <span class="text-fg">${p.cargoText}</span></div>
              </div>
              <div class="mt-1.5 pt-1.5 border-t border-line text-[12px] text-muted">
                <div class="text-[11px] text-muted mb-0.5">Ordered stops</div>
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
          const state = silentAreaState(Number(p.score));
          const stateLabel = STATE_LABEL[state];
          const stateColor = STATE_COLOR[state];

          // Close active hover windows to prevent overlapping states
          hoverPopupRef.current.remove();
          hoverPopupRef.current
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="px-3 py-2 text-[13px] font-sans w-[220px]">
                <div class="flex items-center justify-between gap-2 border-b border-line pb-1.5 mb-1.5">
                  <span class="font-medium text-fg">${p.name}</span>
                  <span class="flex items-center gap-1.5 text-[12px] text-muted">
                    <span style="width:6px;height:6px;border-radius:9999px;background:${stateColor}"></span>
                    ${stateLabel}
                  </span>
                </div>
                <div class="text-[11px] text-muted mb-1.5">Silent Area score · ${scorePct}%</div>
                <div class="space-y-1 text-[12px]">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-muted">Pop density</span>
                    <span class="text-muted">${density}/km² · <span class="text-fg font-mono tabular-nums">${popN}</span></span>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-muted">Hazard exposure</span>
                    <span class="text-muted">${hazard} · <span class="text-fg font-mono tabular-nums">${hazN}</span></span>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-muted">Since contact</span>
                    <span class="text-muted">${contactStr} · <span class="text-fg font-mono tabular-nums">${timeN}</span></span>
                  </div>
                </div>
                <div class="mt-1.5 pt-1.5 border-t border-line text-[12px] text-muted text-center font-mono tabular-nums">
                  ${popN} × ${hazN} × ${timeN} = <span class="text-fg">${Number(p.score).toFixed(2)}</span>
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
              <div class="px-2.5 py-1.5 text-[13px] font-sans">
                <div class="font-medium text-fg">${props.name}</div>
                <div class="text-[12px] text-muted mt-0.5 capitalize">Status · <span class="text-fg">${props.status}</span></div>
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
            `<div class="leading-snug"><span class="text-fg font-mono">${s.sequence}.</span> ${s.barangayName} <span class="text-muted">— ${s.action}</span></div>`,
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
      const isSelected = selectedReport?.id === report.id;
      const status = report.status;
      const bg = reportStatusColor(status);

      const el = document.createElement('div');
      el.className = 'flex items-center justify-center relative cursor-pointer';

      const size = isSelected ? 26 : 20;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;

      let iconMarkup = '';
      if (status === 'pending') {
        iconMarkup = `<span style="color:#0e1424;font-size:11px;font-weight:700;font-family:sans-serif;line-height:1;">!</span>`;
      } else if (status === 'confirmed') {
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0e1424" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>`;
      } else if (status === 'flagged') {
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>`;
      }

      el.innerHTML = `
        <div style="
          background: ${bg};
          border: 1.5px solid rgba(14,20,36,0.85);
          border-radius: 50%;
          width: ${size}px;
          height: ${size}px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.5);
          transition: transform 0.1s ease;
        " class="hover:scale-110">
          ${iconMarkup}
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        const dot = reportStatusColor(status);
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat([report.longitude, report.latitude])
          .setHTML(`
            <div class="px-2.5 py-1.5 text-[13px] font-sans max-w-[220px]">
              <div class="flex items-center gap-2 mb-1 border-b border-line pb-1 justify-between">
                <span class="font-mono text-muted text-[12px]">#${report.id}</span>
                <span class="flex items-center gap-1.5 text-[12px] text-muted capitalize">
                  <span style="width:6px;height:6px;border-radius:9999px;background:${dot}"></span>${status}
                </span>
              </div>
              <div class="text-fg mb-1 line-clamp-2">"${report.rawText}"</div>
              <div class="text-[12px] text-muted capitalize">Source · ${report.source}</div>
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

      const marker = new maplibreglRef.current.Marker({ element: el })
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

      let iconColor = COLOR.muted;
      let iconMarkup = '';

      if (team.type === 'boat') {
        iconColor = COLOR.muted;
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v17M2 10c0 4.4 3.6 8 10 8s10-3.6 10-8H2z"/>
          </svg>
        `;
      } else if (team.type === 'ambulance') {
        iconColor = COLOR.muted;
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        `;
      } else if (team.type === '4x4') {
        iconColor = COLOR.muted;
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18.5" cy="17.5" r="2.5"/>
            <circle cx="5.5" cy="17.5" r="2.5"/>
            <path d="M14 6H5a2 2 0 0 0-2 2v6h18v-3a3 3 0 0 0-3-3h-4Z"/>
          </svg>
        `;
      } else {
        iconColor = COLOR.muted;
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
          background: #151e31;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          padding: 3px 5px;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        ">
          ${iconMarkup}
          <span style="color:#92a0b8;font-size:9px;font-weight:600;font-family:var(--font-jetbrains-mono),monospace;">${label}</span>
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat([team.baseLocation.lng + 0.005, team.baseLocation.lat + 0.005])
          .setHTML(`
            <div class="px-2.5 py-1.5 text-[13px] font-sans">
              <div class="font-medium text-fg mb-0.5">${team.name}</div>
              <div class="text-[12px] text-muted capitalize">Type · ${team.type}</div>
              <div class="text-[12px] text-muted capitalize">Status · ${team.status}</div>
              <div class="text-[12px] text-muted">Capacity · <span class="font-mono tabular-nums">${team.capacityKg.toLocaleString()}</span> kg</div>
            </div>
          `)
          .addTo(map);
      });

      el.addEventListener('mouseleave', () => {
        hoverPopupRef.current.remove();
      });

      const marker = new maplibreglRef.current.Marker({ element: el })
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
          background: #151e31;
          border: 1.5px solid ${fill};
          border-radius: 50%;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
          transition: transform 0.1s;
        " class="hover:scale-110">
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
            <div class="px-2.5 py-1.5 text-[13px] font-sans">
              <div class="font-medium text-fg mb-0.5">${vol.name}</div>
              <div class="text-[12px] text-muted">Team · <span class="text-fg">${vol.teamName || 'Independent'}</span></div>
              <div class="text-[12px] capitalize flex items-center gap-1.5 mt-0.5 text-muted">
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

      const marker = new maplibreglRef.current.Marker({ element: el })
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
      
      let hubColor = '#46506a';
      let iconMarkup = '';

      if (hub.type === 'shelter') {
        hubColor = '#46506a';
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        `;
      } else if (hub.type === 'supply_hub') {
        hubColor = '#46506a';
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
            <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
          </svg>
        `;
      } else {
        // Warehouse (Large Depot)
        hubColor = '#46506a';
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
          border: 1px solid rgba(232,238,249,0.35);
          border-radius: 6px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
          transition: transform 0.1s;
        " class="hover:scale-110">
          ${iconMarkup}
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat([hub.longitude, hub.latitude])
          .setHTML(`
            <div class="px-2.5 py-1.5 text-[13px] font-sans">
              <div class="font-medium text-fg mb-0.5">${hub.name}</div>
              <div class="text-[12px] text-muted capitalize">Type · ${hub.type.replace('_', ' ')}</div>
              <div class="text-[12px] text-muted mt-0.5">Capacity · <span class="text-fg font-mono tabular-nums">${hub.capacityPercent}%</span></div>
            </div>
          `)
          .addTo(map);
      });

      el.addEventListener('mouseleave', () => {
        hoverPopupRef.current.remove();
      });

      const marker = new maplibreglRef.current.Marker({ element: el })
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
      className={`relative flex-1 bg-surface border border-line rounded-card overflow-hidden flex flex-col${
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
        /* Tooltip styling — calm surface; inner HTML controls padding */
        .command-map-tooltip .maplibregl-popup-content {
          background-color: var(--color-raised) !important;
          color: var(--color-fg) !important;
          border: 1px solid var(--color-line) !important;
          border-radius: 10px !important;
          padding: 0 !important;
          box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.5) !important;
        }
        .command-map-tooltip .maplibregl-popup-tip {
          border-top-color: var(--color-raised) !important;
          border-bottom-color: var(--color-raised) !important;
        }
      `}</style>

      {/* Header */}
      <div className="bg-surface border-b border-line px-4 h-11 flex items-center justify-between z-10 select-none">
        <div className="flex items-center gap-2.5">
          <Compass className="w-4 h-4 text-muted" />
          <span className="text-[14px] font-medium text-fg">Live Operations Map</span>
          {onResetReports && (
            <button
              onClick={() => {
                onResetReports();
                onSelectReport(null as any);
                setSelectedEdge(null);
              }}
              className="ml-2 px-2 py-1 text-[12px] text-muted hover:text-fg hover:bg-raised rounded-control transition-colors duration-100 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 text-[12px]">
          {LAYER_BUTTONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMapLayers((p) => ({ ...p, [key]: !p[key] }))}
              className={`px-2 py-1 rounded-control transition-colors duration-100 cursor-pointer ${
                mapLayers[key]
                  ? 'bg-raised text-fg'
                  : 'text-muted hover:text-fg hover:bg-raised/40'
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
          className="absolute top-3 left-3 z-10 w-7 h-7 bg-surface border border-line hover:bg-raised text-muted hover:text-fg rounded-control flex items-center justify-center cursor-pointer transition-colors duration-100 select-none"
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
              className="w-7 h-7 bg-surface border border-line hover:bg-raised text-muted hover:text-fg rounded-control flex items-center justify-center text-sm cursor-pointer transition-colors duration-100 select-none"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Road edge popup (Adjusted left position to sit right beside the top-left fullscreen icon) */}
        {selectedEdge && (
          <div className="absolute top-3 left-12 w-[290px] bg-surface border border-line p-3.5 rounded-card text-[13px] flex flex-col gap-2.5 z-10">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="font-medium text-fg truncate max-w-[200px]">
                {selectedEdge.name}
              </span>
              <button
                onClick={() => setSelectedEdge(null)}
                className="text-muted hover:text-fg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[12px] text-muted block">Accessibility</span>
              <div className="grid grid-cols-2 gap-1.5 text-[12px]">
                {(['open','slow','blocked','damaged'] as const).map((s) => {
                  const activeStyles: Record<string, string> = {
                    open:    'bg-raised border-line text-fg',
                    slow:    'border-warning/40 bg-warning/10 text-warning',
                    blocked: 'border-critical/40 bg-critical/10 text-critical',
                    damaged: 'border-critical/40 bg-critical/10 text-critical',
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
                      className={`py-1.5 border rounded-control cursor-pointer transition-colors duration-100 ${
                        active ? activeStyles[s] : 'border-line text-muted hover:bg-raised/40 hover:text-fg'
                      }`}
                    >
                      {labels[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[12px] text-muted block">Notes</label>
              <textarea
                value={roadNotes}
                onChange={(e) => setRoadNotes(e.target.value)}
                placeholder="Additional details…"
                className="w-full bg-bg border border-line p-2 rounded-control text-[13px] text-fg placeholder:text-muted focus:outline-none focus:border-muted resize-none h-14"
              />
            </div>

            <button
              onClick={() => {
                onUpdateRoadStatus(selectedEdge.id, selectedEdge.status, roadNotes);
                setSelectedEdge(null);
              }}
              className="w-full py-2 border border-line text-fg hover:bg-raised rounded-control transition-colors duration-100 cursor-pointer text-[13px] font-medium"
            >
              Save status
            </button>
          </div>
        )}

        {/* Report popup (Adjusted left position to sit right beside the top-left fullscreen icon) */}
        {selectedReport && (
          <div className="absolute top-3 left-12 w-[300px] bg-surface border border-line p-3.5 rounded-card text-[13px] flex flex-col gap-2.5 z-10">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-muted" />
                <span className="font-mono text-muted text-[12px]">#{selectedReport.id}</span>
              </div>
              <button
                onClick={() => onSelectReport(null as unknown as FieldReport)}
                className="text-muted hover:text-fg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[12px] text-muted">
                <span>Reporter · <span className="text-fg">{selectedReport.reporterName}</span></span>
                <span className="flex items-center gap-1 font-mono tabular-nums">
                  <Clock className="w-3 h-3" />
                  {new Date(selectedReport.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="bg-bg border border-line p-2.5 rounded-control text-[13px] text-fg leading-relaxed">
                &ldquo;{selectedReport.rawText}&rdquo;
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-[12px] border-b border-line pb-2.5">
                <div>
                  <span className="block text-[11px] text-muted mb-0.5">Barangay</span>
                  <span className="text-fg">{selectedReport.barangayName ?? 'Unknown'}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-muted mb-0.5">Severity</span>
                  <span className="flex items-center gap-1.5 text-fg capitalize">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background:
                          selectedReport.needsSeverity === 'critical' || selectedReport.needsSeverity === 'high'
                            ? COLOR.critical
                            : selectedReport.needsSeverity === 'medium'
                            ? COLOR.warning
                            : COLOR.muted,
                      }}
                    />
                    {selectedReport.needsSeverity}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-muted mb-0.5">Est. affected</span>
                  <span className="text-fg">
                    {selectedReport.populationEstimate > 0 ? `${selectedReport.populationEstimate} people` : 'None / minor'}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] text-muted mb-0.5">Impediment</span>
                  <span className="text-fg">
                    {selectedReport.roadImpassable ? 'Impassable' : selectedReport.roadStatus || 'None'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[12px] text-muted">
                <span>Confidence</span>
                <span className="text-fg font-mono tabular-nums">{Math.round(selectedReport.confidence * 100)}%</span>
              </div>

              <div className="flex items-center justify-between text-[12px] text-muted">
                <span>Status</span>
                <span className="flex items-center gap-1.5 text-fg capitalize">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: reportStatusColor(selectedReport.status) }} />
                  {selectedReport.status}
                </span>
              </div>
            </div>

            {selectedReport.status === 'pending' && (
              <div className="flex items-center gap-2 pt-2 border-t border-line">
                <button
                  onClick={() => {
                    onConfirmReport(selectedReport.id);
                    onSelectReport(null as unknown as FieldReport);
                  }}
                  className="flex-1 py-2 border border-active/40 bg-active/10 text-active hover:bg-active/20 rounded-control flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100 text-[13px] font-medium"
                >
                  <Check className="w-3.5 h-3.5" /> Confirm
                </button>
                <button
                  onClick={() => {
                    onFlagReport(selectedReport.id);
                    onSelectReport(null as unknown as FieldReport);
                  }}
                  className="px-3 py-2 border border-line text-muted hover:text-critical hover:border-critical/40 rounded-control flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-100 text-[13px]"
                >
                  <AlertOctagon className="w-3.5 h-3.5" /> Flag
                </button>
              </div>
            )}
          </div>
        )}

        {/* Updated Legend Panel (Hub colors explicit to display the 3 distinct types) */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1.5 select-none">
          {legendOpen && (
            <div className="bg-surface border border-line p-3 rounded-card text-[12px] text-muted flex flex-col gap-3 w-[168px]">
              <div>
                <div className="text-[11px] text-muted mb-1.5">Barangay state</div>
                <div className="space-y-1">
                  {[
                    { color: COLOR.reached, label: 'Reached' },
                    { color: COLOR.warning, label: 'Escalating' },
                    { color: COLOR.critical, label: 'Critical' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-fg">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-line pt-2">
                <div className="text-[11px] text-muted mb-1.5">Roads</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-0.5 inline-block shrink-0" style={{ background: ROAD_OPEN }} />
                    <span className="text-fg">Open</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-0.5 inline-block shrink-0" style={{ background: COLOR.warning }} />
                    <span className="text-fg">Slow</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 border-t-2 border-dashed inline-block shrink-0" style={{ borderColor: COLOR.critical }} />
                    <span className="text-fg">Blocked</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-0.5 inline-block shrink-0" style={{ background: COLOR.critical }} />
                    <span className="text-fg">Damaged</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-line pt-2">
                <div className="text-[11px] text-muted mb-1.5">Routes</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-0.5 inline-block shrink-0" style={{ background: ROUTE_ACTIVE }} />
                    <span className="text-fg">Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 border-t-2 border-dashed inline-block shrink-0" style={{ borderColor: ROUTE_PLANNED }} />
                    <span className="text-fg">Planned</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-0.5 inline-block shrink-0" style={{ background: ROUTE_DONE }} />
                    <span className="text-fg">Completed</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-line pt-2">
                <div className="text-[11px] text-muted mb-1.5">Reports</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOR.warning }} />
                    <span className="text-fg">Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOR.active }} />
                    <span className="text-fg">Verified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLOR.critical }} />
                    <span className="text-fg">Flagged</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-line pt-2">
                <div className="text-[11px] text-muted mb-1.5">Assets</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2 rounded-sm inline-block shrink-0" style={{ background: '#46506a', border: '1px solid rgba(232,238,249,0.35)' }} />
                    <span className="text-fg">Logistics hub</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2 rounded-sm inline-block shrink-0 bg-raised border border-line" />
                    <span className="text-fg">Response team</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setLegendOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border border-line text-muted hover:text-fg hover:bg-raised rounded-control text-[12px] cursor-pointer transition-colors duration-100"
          >
            Legend
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: legendOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.1s' }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}