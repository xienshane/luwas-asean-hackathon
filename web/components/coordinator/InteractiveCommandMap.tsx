'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Compass,
  FileText,
  Clock,
  Check,
  AlertOctagon,
  X,
} from 'lucide-react';
import type { Marker, Popup, MapMouseEvent, MapLayerMouseEvent, MapGeoJSONFeature, LngLat, GeoJSONSource } from 'maplibre-gl';
import type { Barangay, FieldReport, Team, RoadEdge, Route, Volunteer, LocationHub } from '@/lib/types/coordinator';
import { routeLineCoords } from '@/lib/coordinator/routeGeometry';
import { pointAtFraction, stopFraction } from '@/lib/coordinator/pathInterpolate';
import { nextGhostState, emptyGhostState, ghostDivergentSegments } from '@/lib/coordinator/ghostRoutes';
import { applyGraphiteBasemap } from '@/lib/coordinator/basemapTheme';
import { hasTranslation } from '@/lib/reports/translation';
import { reportPinTier, isLoudTier, DOT_RADIUS, DOT_OPACITY } from '@/lib/coordinator/reportPins';
import { COLOR, MAP, silentAreaState, STATE_COLOR, STATE_LABEL, SERVED_COLOR, SERVED_LABEL, SilentWatchChip } from './ui';
import { DEFAULT_REGION, REGION_LIST, REGIONS, type RegionId } from '@/lib/regions';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre erases GeoJSON feature properties to an untyped scalar bag; alias it once.
type FeatureProps = NonNullable<MapGeoJSONFeature['properties']>;

// Map linework tones now live in ui/tokens.ts as MAP (single source of truth,
// shared with the legend). Local aliases keep the paint expressions terse.
const { ROAD_OPEN, ROUTE_ACTIVE, ROUTE_PLANNED, ROUTE_DONE, ROUTE_CASING, BARANGAY_OUTLINE } = MAP;

// Part A — demo convoy. A clearly-labelled SIMULATED vehicle (not live telemetry) that eases
// along the real-road route geometry and parks short of the destination. DEMO_CONVOY is the
// one-line kill switch; CONVOY_MS is the ease duration before it parks at stopFraction.
const DEMO_CONVOY = true;
const CONVOY_MS = 14000;

// Convoy chip icon in the team-type language, dark stroke for contrast on the active-green chip.
function convoyIcon(type?: string): string {
  const a = `width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06281f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;
  if (type === 'boat') return `<svg ${a}><path d="M12 3v17M2 10c0 4.4 3.6 8 10 8s10-3.6 10-8H2z"/></svg>`;
  if (type === 'ambulance') return `<svg ${a}><path d="M19 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
  if (type === '4x4') return `<svg ${a}><circle cx="18.5" cy="17.5" r="2.5"/><circle cx="5.5" cy="17.5" r="2.5"/><path d="M14 6H5a2 2 0 0 0-2 2v6h18v-3a3 3 0 0 0-3-3h-4Z"/></svg>`;
  return `<svg ${a}><rect x="1" y="3" width="15" height="13" rx="2" ry="2"/><polygon points="16 8 20 8 23 11 23 16 16 16"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
}

interface InteractiveCommandMapProps {
  barangays: Barangay[];
  reports: FieldReport[];
  teams: Team[];
  edges: RoadEdge[];
  routes: Route[];
  facilities: LocationHub[];
  dispatchPreview?: { teamId: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null;
  volunteers: Volunteer[];
  selectedBarangay: Barangay | null;
  onSelectBarangay: (b: Barangay) => void;
  selectedReport: FieldReport | null;
  onSelectReport: (r: FieldReport) => void;
  onSelectRoute?: (route: Route) => void;
  scores: {
    barangayId: string; score: number; hoursSinceContact: number | null;
    timeFactor?: number; popDensityNorm?: number; hazardNorm?: number;
    structuralVulnFrac?: number; impactFrac?: number; nearbyNorm?: number;
    weights?: { pop: number; hazard: number; vuln: number; impact: number; silence: number; nearby: number };
  }[];
  /** Earliest report of the operation — the Silent Watch clock origin for areas never contacted. */
  operationStartedAt: string | null;
  onUpdateRoadStatus: (edgeId: string, status: 'open' | 'slow' | 'blocked' | 'damaged', notes?: string) => void;
  /** Phase 4.5: coordinator click-to-block — snaps the clicked point to the nearest road edge. */
  onBlockRoadAt?: (lat: number, lng: number) => void;
  onConfirmReport: (reportId: string) => void;
  onFlagReport: (reportId: string) => void;
  onResetReports?: () => void;
  active?: boolean;
  /** Country pack on screen. Changing it re-homes the map to that region. */
  region?: RegionId;
  /** Omit to hide the region switch entirely (single-region deployments). */
  onSelectRegion?: (region: RegionId) => void;
}

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
  facilities,
  dispatchPreview,
  volunteers,
  selectedBarangay,
  onSelectBarangay,
  selectedReport,
  onSelectReport,
  onSelectRoute,
  scores,
  operationStartedAt,
  onUpdateRoadStatus,
  onBlockRoadAt,
  onConfirmReport,
  onFlagReport,
  onResetReports,
  active = true,
  region = DEFAULT_REGION,
  onSelectRegion,
}: InteractiveCommandMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maplibreglRef = useRef<any>(null); // npm maplibre-gl module (client-only dynamic import)
  // initMap runs from an async style load, by which time `region` may have moved on.
  // The ref is what it reads, so the first paint lands on the right country.
  const regionRef = useRef<RegionId>(region);
  useEffect(() => { regionRef.current = region; }, [region]);

  // Separate, isolated refs for markers
  const reportMarkersRef = useRef<Marker[]>([]);
  const teamMarkersRef = useRef<Marker[]>([]);
  const volunteerMarkersRef = useRef<Marker[]>([]);
  const hubMarkersRef = useRef<Marker[]>([]);
  const routeEndpointMarkersRef = useRef<Marker[]>([]);
  const blockedMarkersRef = useRef<Marker[]>([]);
  const ghostLabelMarkersRef = useRef<Marker[]>([]);
  const vehicleMarkersRef = useRef<Map<string, Marker>>(new Map());
  const convoyStateRef = useRef<Map<string, {
    coords: [number, number][]; stop: number; start: number; parked: boolean; iconEl: HTMLElement | null;
  }>>(new Map());
  const convoyRafRef = useRef<number>(0);
  const ghostStateRef = useRef(emptyGhostState());

  // Tooltip popup reference
  // Always assigned before any hover handler reads it (see map 'load'); typed non-null to
  // preserve the existing call sites without scattering guards.
  const hoverPopupRef = useRef<Popup>(null!);

  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Cursor coordinate readout (telemetry accent). The lngLat is stashed in a ref on every
  // 'mousemove' and flushed to state at most once per animation frame, so React re-renders at
  // frame cadence instead of per pixel (same rAF-throttle pattern as convoyRafRef).
  const [cursorLngLat, setCursorLngLat] = useState<LngLat | null>(null);
  const cursorLatestRef = useRef<LngLat | null>(null);
  const cursorRafRef = useRef<number>(0);

  const [routeGeometries, setRouteGeometries] = useState<Record<string, [number, number][]>>({});
  const [roadGeometries, setRoadGeometries] = useState<Record<string, [number, number][]>>({}); // Store actual road paths
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
  // Phase 4.5: "Block road" mode — the next map click snaps to the nearest edge + blocks it.
  // Refs let the stable map click listener read the live values without re-binding.
  const [blockMode, setBlockMode] = useState(false);
  const blockModeRef = useRef(false);
  useEffect(() => { blockModeRef.current = blockMode; }, [blockMode]);
  const onBlockRoadAtRef = useRef(onBlockRoadAt);
  useEffect(() => { onBlockRoadAtRef.current = onBlockRoadAt; }, [onBlockRoadAt]);
  // Report detail card defaults to the English translation; this holds the report id
  // whose original is currently revealed, so switching reports resets to translated.
  const [reportOriginalId, setReportOriginalId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  // Hover + selection highlight is driven by MapLibre feature-state (set directly on the
  // source on mouse/selection events) instead of rebuilding ~1,200 features each time.
  const hoveredBarangayIdRef = useRef<string | null>(null);
  const selectedBarangayIdRef = useRef<string | null>(null);

  // Keep refs of edges for dynamic access
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Same pattern for barangays: the click listener is bound once at map load (before the
  // async Supabase fetch resolves), so handleBarangayClick must read the *current* list via
  // a ref — otherwise it closes over the initial empty array and never finds the clicked one.
  const barangaysRef = useRef(barangays);
  useEffect(() => {
    barangaysRef.current = barangays;
  }, [barangays]);

  // A barangay is "served" once it is a stop on a COMPLETED route — relief was delivered
  // there. Collected into a Set so the choropleth can paint it green (overriding the
  // score-based color) and the tooltip/legend can flag it explicitly.
  const servedBarangayIds = useMemo(() => {
    const ids = new Set<string>();
    for (const route of routes) {
      if (route.status !== 'completed') continue;
      for (const stop of route.stops ?? []) {
        if (stop.barangayId) ids.add(stop.barangayId);
      }
    }
    return ids;
  }, [routes]);

  // Reports sitting in the queue for the selected barangay. Lets the Silent Watch
  // chip distinguish "nothing has arrived" from "something arrived but nobody has
  // verified it" — only a confirmed report stops the silence clock, so both states
  // read as Silent and the difference is exactly what a coordinator needs to see.
  const unverifiedForSelected = useMemo(
    () =>
      selectedBarangay
        ? reports.filter((r) => r.barangayId === selectedBarangay.id && r.status === 'pending').length
        : 0,
    [reports, selectedBarangay],
  );

  // Route-line click is bound once at map load too, so read the current routes + callback via refs.
  const routesRef = useRef(routes);
  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);
  const onSelectRouteRef = useRef(onSelectRoute);
  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  const getScoreData = useCallback(
    (barangayId: string) =>
      scores.find((s) => s.barangayId === barangayId) ??
      {
        barangayId, score: 0, hoursSinceContact: null, timeFactor: 1,
        popDensityNorm: 0, hazardNorm: 0, structuralVulnFrac: 0, impactFrac: 0, nearbyNorm: 0,
        weights: { pop: 0.15, hazard: 0.2, vuln: 0.15, impact: 0.25, silence: 0.15, nearby: 0.1 },
      },
    [scores],
  );

  // Helper to find the nearest facility hub to a specific coordinate
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
              const simplified = geometry.filter((_: number[], i: number) => i % 2 === 0 || i === geometry.length - 1);
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

  // ── Load MapLibre from npm (client-only dynamic import) once ─────────────
  // No persisted "already loaded" ref guard: under React StrictMode (on by
  // default in dev) this effect runs mount → cleanup → mount. A persisted guard
  // set on the first mount would make the second mount bail before initMap()
  // ever runs — and the first mount's import resolves *after* cleanup has set
  // cancelled = true, so it skips initMap() too. The map then never appears
  // until a full reload. Instead, each mount gets its own `cancelled` flag and
  // initMap() is idempotent (it bails when mapRef.current is already set).
  useEffect(() => {
    let cancelled = false;
    import('maplibre-gl').then((mod) => {
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maplibreglRef.current = (mod as any).default ?? mod;
      initMap();
    });

    return () => {
      cancelled = true;
      if (cursorRafRef.current) { cancelAnimationFrame(cursorRafRef.current); cursorRafRef.current = 0; }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setIsMapLoaded(false);
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
    // Only ever zoom in: keep the current zoom if it's already tighter than the
    // target so selecting from outside the map never pulls the coordinator back out.
    if (selectedReport) {
      map.flyTo({ center: [selectedReport.longitude, selectedReport.latitude], zoom: Math.max(map.getZoom(), 13.2), essential: true });
    } else if (selectedBarangay) {
      map.flyTo({ center: [selectedBarangay.longitude, selectedBarangay.latitude], zoom: Math.max(map.getZoom(), 12.5), essential: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarangay?.id, selectedReport?.id, isMapLoaded]);

  // ── Map click handlers ──
  // Block-road mode: any click snaps to the nearest edge via the parent handler.
  const handleMapBlockClick = useCallback((e: MapMouseEvent) => {
    if (!blockModeRef.current) return;
    const { lat, lng } = e.lngLat ?? {};
    if (typeof lat === 'number' && typeof lng === 'number') {
      onBlockRoadAtRef.current?.(lat, lng);
    }
    setBlockMode(false);
  }, []);

  const handleRoadClick = useCallback((e: MapLayerMouseEvent) => {
    if (blockModeRef.current) return; // block mode handles the click
    if (!e.features?.length) return;
    const feat = e.features[0];
    const edgeId = feat.properties?.id;
    const edge = edgesRef.current.find((ed) => ed.id === edgeId);
    if (edge) {
      setSelectedEdge(edge);
      setRoadNotes(edge.notes ?? '');
      onSelectReport(null as unknown as FieldReport);
    }
  }, [onSelectReport]);

  const handleBarangayClick = useCallback((e: MapLayerMouseEvent) => {
    if (blockModeRef.current) return; // block mode handles the click
    if (!e.features?.length) return;
    const feat = e.features[0];
    const barangayId = feat.properties?.id;
    const barangay = barangaysRef.current.find(b => b.id === barangayId);
    if (barangay) {
      onSelectBarangay(barangay);
      setSelectedEdge(null);
      const map = mapRef.current;
      map?.flyTo({
        center: [barangay.longitude, barangay.latitude],
        zoom: Math.max(map.getZoom(), 12.5), // only zoom in, never out
        essential: true
      });
    }
  }, [onSelectBarangay]);

  // Clicking a route line jumps to the Teams & Dispatch tab focused on that route's team.
  const handleRouteClick = useCallback((e: MapLayerMouseEvent) => {
    if (blockModeRef.current) return;
    const id = e.features?.[0]?.properties?.id;
    if (!id) return;
    const route = routesRef.current.find((r) => r.id === id);
    if (route) onSelectRouteRef.current?.(route);
  }, []);

  // ── Initialize MapLibre ──
  const initMap = () => {
    const maplibregl = maplibreglRef.current;
    if (!mapContainerRef.current || mapRef.current || !maplibregl) return;

    // Home view comes from the country pack, not a constant: the map has to be able to
    // leave the Philippines when the coordinator switches regions.
    const home = REGIONS[regionRef.current];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: home.center,
      zoom: home.zoom,
      minZoom: 8.0,
      maxBounds: home.bounds,
      attributionControl: { compact: false },
    });

    // Claim the ref synchronously so a re-entrant initMap() (StrictMode remount)
    // bails on the mapRef.current guard before the async 'load' fires.
    mapRef.current = map;

    hoverPopupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 15,
      // Default maxWidth is 240px, which clipped the wider breakdown content; the
      // tooltip width is owned by .command-map-tooltip .maplibregl-popup-content CSS.
      maxWidth: 'none',
      className: 'command-map-tooltip'
    });

    map.on('load', () => {
      // Re-paint the CARTO dark-matter vector basemap to graphite before adding
      // our own sources/layers, so LUWAS routes and pins stay the highest-contrast
      // elements on the canvas (see lib/coordinator/basemapTheme.ts).
      applyGraphiteBasemap(map);

      // Add sources
      map.addSource('barangays-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        // promoteId lifts properties.id to the feature id so hover/selection can be driven
        // by feature-state (set on events) instead of rebuilding all ~1,200 features.
        promoteId: 'id',
      });

      map.addSource('roads-source', {
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
            ['boolean', ['feature-state', 'hovered'], false], 0.32,
            ['boolean', ['feature-state', 'selected'], false], 0.30,
            0.18
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
            ['boolean', ['feature-state', 'selected'], false], COLOR.fg,
            BARANGAY_OUTLINE
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 2,
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
          'text-color': '#C7CBD2',
          'text-halo-color': '#0A0B0D',
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

      // Closed road — hazard styling, deliberately NOT in the route color family. Dark casing
      // gives ≥3:1 on the basemap; heavier core + distinct dash reads as a barrier, not a route.
      map.addLayer({
        id: 'roads-layer-blocked-casing',
        type: 'line',
        source: 'roads-source',
        filter: ['==', ['get', 'status'], 'blocked'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1a0606', 'line-width': 7, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'roads-layer-blocked',
        type: 'line',
        source: 'roads-source',
        filter: ['==', ['get', 'status'], 'blocked'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLOR.critical,
          'line-width': 4,
          'line-opacity': 1,
          'line-dasharray': [2, 1.4],
        },
      });

      // ── Quiet report tiers, drawn as circles rather than DOM markers ──────────
      // Only the loud tier stays a DOM marker (see the report-pins effect). These
      // are the ~90% that are evidence rather than tasks, and there can be a
      // hundred of them: as absolutely-positioned DOM nodes MapLibre had to
      // reposition every one on every frame of a pan or zoom, and DOM markers
      // always paint above the canvas, so background evidence covered the routes
      // drawn through it. A circle layer is one draw call and sits here in the
      // stack — above the roads, below the routes — where evidence belongs.
      map.addSource('reports-dots-source', {
        type: 'geojson',
        // Report ids are UUIDs. A GeoJSON source only accepts integer feature ids
        // natively, so setFeatureState would silently no-op on them; promoteId
        // lifts properties.id into the feature id and makes hover state work —
        // same reason barangays-source carries it.
        promoteId: 'id',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Invisible, generously sized hit target. The visible dots are 2.5–6px, far
      // under any usable pointer target, so interaction is handled by this layer
      // instead — the mark stays quiet without becoming unclickable.
      map.addLayer({
        id: 'reports-dots-hit',
        type: 'circle',
        source: 'reports-dots-source',
        paint: { 'circle-radius': 10, 'circle-opacity': 0, 'circle-color': COLOR.muted },
      });

      map.addLayer({
        id: 'reports-dots',
        type: 'circle',
        source: 'reports-dots-source',
        paint: {
          'circle-color': [
            'match', ['get', 'tier'],
            // Deliberately NOT the brand green for confirmed: COLOR.active means
            // "relief is moving" (routes, dispatch, reached) and ~90 green dots
            // drowned the one signal it is supposed to carry.
            'elevated', COLOR.warning,
            COLOR.muted,
          ],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, ['match', ['get', 'tier'], 'elevated', DOT_RADIUS.elevated[0], 'routine', DOT_RADIUS.routine[0], DOT_RADIUS.done[0]],
            15, ['match', ['get', 'tier'], 'elevated', DOT_RADIUS.elevated[1], 'routine', DOT_RADIUS.routine[1], DOT_RADIUS.done[1]],
          ],
          'circle-opacity': [
            'match', ['get', 'tier'],
            'elevated', DOT_OPACITY.elevated,
            'routine', DOT_OPACITY.routine,
            DOT_OPACITY.done,
          ],
          // A hairline stroke that appears only on hover: feedback without the
          // size change that would make a dense field jitter under the cursor.
          'circle-stroke-color': COLOR.fg,
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hovered'], false], 1.5, 0],
        },
      });

      // ── Per-team OR-Tools route layers (always-on; distinct from the dynamic incident line) ──
      map.addSource('team-routes-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Ghost of a route's PREVIOUS path, kept at low opacity after a reroute until the area is
      // reached or it reroutes again. Added before the live layers so it renders underneath.
      map.addSource('team-routes-ghost-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      // Dark casing first so a faded line still reads against the dark basemap.
      map.addLayer({
        id: 'team-routes-ghost-casing', type: 'line', source: 'team-routes-ghost-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROUTE_CASING, 'line-width': 6, 'line-opacity': 0.55 },
      });
      // The ghost is a LOW-OPACITY version of the active route color — unmistakably "a route",
      // just faded as the old one. The low opacity + the on-map "Original route" chip keep it
      // distinct from the live active line.
      map.addLayer({
        id: 'team-routes-ghost', type: 'line', source: 'team-routes-ghost-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROUTE_ACTIVE, 'line-width': 3.5, 'line-opacity': 0.5 },
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
          'line-width': ['match', ['get', 'status'], 'completed', 3, 4.5],
          'line-opacity': 0.9,
          'line-opacity-transition': { duration: 300 },
        },
      });

      // Directional "flow" overlay on active routes (motion-meaning); animated in a rAF effect.
      map.addLayer({
        id: 'team-routes-flow', type: 'line', source: 'team-routes-source',
        filter: ['==', ['get', 'status'], 'active'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#eafff9', 'line-width': 2, 'line-opacity': 0.9, 'line-dasharray': [0, 4, 3] },
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

      // Provisional dispatch line (hub -> area), shown via OSRM while the real pgRouting route
      // computes. Amber + dashed, distinct from the route of record; replaced by the active route.
      map.addSource('dispatch-preview-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'dispatch-preview-line', type: 'line', source: 'dispatch-preview-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': COLOR.warning, 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [1.5, 1.2] },
      });

      // A closure is the REASON a route bends — it must sit above the routes and the ghost.
      ['roads-layer-blocked-casing', 'roads-layer-blocked'].forEach((id) => {
        if (map.getLayer(id)) map.moveLayer(id); // move to top of the current stack
      });

      // Per-team route hover: ETA + cargo summary + ordered stops popover
      const onTeamRouteHover = (e: MapLayerMouseEvent) => {
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
        map.on('mousemove', lid, (e: MapLayerMouseEvent) => hoverPopupRef.current.setLngLat(e.lngLat));
        map.on('mouseleave', lid, onTeamRouteLeave);
        map.on('click', lid, handleRouteClick);
      });

      // Event handlers
      map.on('click', handleMapBlockClick); // block-road mode (no-op unless active)
      map.on('click', 'roads-layer-solid', handleRoadClick);
      map.on('click', 'roads-layer-blocked', handleRoadClick);
      map.on('click', 'barangays-fill', handleBarangayClick);
      map.on('click', 'barangays-outline', handleBarangayClick);

      // Hover: drive the polygon highlight with feature-state and keep the tooltip in sync
      // as the cursor crosses between adjacent barangays. Real boundaries touch, so
      // 'mouseenter' alone wouldn't refire when moving straight from one barangay into the
      // next — we update on 'mousemove' and only rebuild the tooltip when the id changes.
      const showBarangayTooltip = (p: FeatureProps, lngLat: LngLat) => {
        const scorePct = Math.round(p.score * 100);
        const density = Number(p.popDensity).toLocaleString();
        const hazard = Number(p.hazardComposite).toFixed(2);
        // Phase 4.4 composite priority: six weighted components, each ∈ [0,1].
        const popN = Number(p.popDensityNorm);
        const hazN = Number(p.hazardNorm);
        const vulnN = Number(p.structuralVulnFrac);
        const impactN = Number(p.impactFrac);
        const timeN = Number(p.timeFactor);
        const nearN = Number(p.nearbyNorm);
        const wPop = Number(p.wPop), wHaz = Number(p.wHazard), wVuln = Number(p.wVuln);
        const wImp = Number(p.wImpact), wSil = Number(p.wSilence), wNear = Number(p.wNearby);
        const contactStr =
          p.hoursSinceContact === null || p.hoursSinceContact === undefined || p.hoursSinceContact === ''
            ? 'No contact'
            : `${Math.round(Number(p.hoursSinceContact))}h ago`;
        const served = p.served === true || p.served === 'true';
        const state = silentAreaState(Number(p.score));
        const stateLabel = served ? SERVED_LABEL : STATE_LABEL[state];
        const stateColor = served ? SERVED_COLOR : STATE_COLOR[state];

        // One breakdown row: label · weight (left), a 0–1 fill bar (middle), and the
        // component value (right). The fixed 3-column grid + a fill bar that scales by
        // percentage means nothing can push past the bubble. `title` shows the raw
        // context and the weighted contribution on hover.
        const row = (label: string, w: number, c: number, ctx: string) => {
          const pct = Math.max(2, Math.round(c * 100));
          return `
                  <span class="text-muted whitespace-nowrap" title="${ctx} · weight ${Math.round(w * 100)}% → +${(w * c).toFixed(2)}">${label}<span class="opacity-50"> ·${Math.round(w * 100)}%</span></span>
                  <span class="h-1 rounded-full self-center" style="background:rgba(255,255,255,0.07)"><span class="block h-1 rounded-full" style="width:${pct}%;background:var(--color-muted)"></span></span>
                  <span class="text-right font-mono tabular-nums text-fg">${c.toFixed(2)}</span>`;
        };
        const recon = [wPop * popN, wHaz * hazN, wVuln * vulnN, wImp * impactN, wSil * timeN, wNear * nearN]
          .map((v) => v.toFixed(2)).join(' + ');

        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat(lngLat)
          .setHTML(`
              <div class="px-3 py-2.5 text-[13px] font-sans">
                <div class="flex items-center justify-between gap-2 border-b border-line pb-1.5 mb-2">
                  <span class="font-medium text-fg truncate">${p.name}</span>
                  <span class="flex items-center gap-1.5 text-[12px] shrink-0" style="color:${served ? stateColor : 'var(--color-muted)'}">
                    ${served
                      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${stateColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
                      : `<span style="width:6px;height:6px;border-radius:9999px;background:${stateColor}"></span>`}
                    ${stateLabel}
                  </span>
                </div>
                <div class="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-2 items-center text-[12px]">
                  ${row('Pop density', wPop, popN, `${density}/km²`)}
                  ${row('Hazard', wHaz, hazN, hazard)}
                  ${row('Structural vuln.', wVuln, vulnN, `${Math.round(vulnN * 100)}% of housing`)}
                  ${row('Predicted impact', wImp, impactN, `${Math.round(impactN * 100)}% of pop`)}
                  ${row('Silence', wSil, timeN, contactStr)}
                  ${row('Nearby reports', wNear, nearN, nearN > 0 ? 'active' : 'none')}
                </div>
                <div class="mt-2 pt-1.5 border-t border-line flex items-baseline justify-between gap-2">
                  <span class="text-[11px] text-muted">Composite priority</span>
                  <span class="font-mono tabular-nums text-[15px] text-fg">${scorePct}%</span>
                </div>
                <div class="mt-0.5 text-[9.5px] text-muted/80 font-mono tabular-nums leading-snug break-words whitespace-normal">
                  ${recon} = ${Number(p.score).toFixed(2)}
                </div>
              </div>
            `)
          .addTo(map);
      };

      const onBarangayHover = (e: MapLayerMouseEvent) => {
        const feat = e.features?.[0];
        if (!feat?.properties?.id) return;
        map.getCanvas().style.cursor = 'pointer';
        const id = feat.properties.id;
        if (hoveredBarangayIdRef.current !== id) {
          if (hoveredBarangayIdRef.current !== null) {
            map.setFeatureState({ source: 'barangays-source', id: hoveredBarangayIdRef.current }, { hovered: false });
          }
          hoveredBarangayIdRef.current = id;
          map.setFeatureState({ source: 'barangays-source', id }, { hovered: true });
          showBarangayTooltip(feat.properties, e.lngLat); // rebuild only when the barangay changes
        } else {
          hoverPopupRef.current.setLngLat(e.lngLat); // same barangay → just follow the cursor
        }
      };

      map.on('mouseenter', 'barangays-fill', onBarangayHover);
      map.on('mousemove', 'barangays-fill', onBarangayHover);
      map.on('mouseleave', 'barangays-fill', () => {
        if (hoveredBarangayIdRef.current !== null) {
          map.setFeatureState({ source: 'barangays-source', id: hoveredBarangayIdRef.current }, { hovered: false });
          hoveredBarangayIdRef.current = null;
        }
        map.getCanvas().style.cursor = '';
        hoverPopupRef.current.remove();
      });

      // Road hover interactive swell effect + tooltip
      const onRoadHover = (e: MapLayerMouseEvent) => {
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
      map.on('mousemove', 'roads-layer-solid', (e: MapLayerMouseEvent) => hoverPopupRef.current.setLngLat(e.lngLat));
      map.on('mouseleave', 'roads-layer-solid', onRoadLeave);

      map.on('mouseenter', 'roads-layer-blocked', onRoadHover);
      map.on('mousemove', 'roads-layer-blocked', (e: MapLayerMouseEvent) => hoverPopupRef.current.setLngLat(e.lngLat));
      map.on('mouseleave', 'roads-layer-blocked', onRoadLeave);

      setIsMapLoaded(true);

      setTimeout(() => map.resize(), 100);
    });

    // Cursor coordinate readout: capture on every move, flush to React once per frame.
    const flushCursor = () => {
      cursorRafRef.current = 0;
      setCursorLngLat(cursorLatestRef.current);
    };
    map.on('mousemove', (e: MapMouseEvent) => {
      cursorLatestRef.current = e.lngLat;
      if (!cursorRafRef.current) cursorRafRef.current = requestAnimationFrame(flushCursor);
    });
    map.on('mouseout', () => {
      if (cursorRafRef.current) { cancelAnimationFrame(cursorRafRef.current); cursorRafRef.current = 0; }
      cursorLatestRef.current = null;
      setCursorLngLat(null);
    });

    // Metric scale bar (MapLibre built-in control) — telemetry accent, retinted in the <style> block.
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 96, unit: 'metric' }), 'bottom-left');
  };

  // ── Update Barangay Polygons ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const barangaysSource = map.getSource('barangays-source');
    if (barangaysSource && mapLayers.barangays) {
      const features = barangays.map(barangay => {
        const sd = getScoreData(barangay.id);
        // Served (delivered-to) barangays render green, overriding the priority choropleth.
        const served = servedBarangayIds.has(barangay.id);
        const color = served ? SERVED_COLOR : scoreColor(sd.score);

        return {
          type: 'Feature',
          properties: {
            id: barangay.id,
            name: barangay.name,
            score: sd.score,
            served,
            hoursSinceContact: sd.hoursSinceContact,
            color: color,
            // Composite-priority components for the hover breakdown tooltip (Phase 4.4).
            // MapLibre flattens feature properties to scalars, so the weights are passed
            // as individual numbers rather than a nested object.
            popDensity: barangay.popDensity,
            hazardComposite: barangay.hazardComposite,
            popDensityNorm: sd.popDensityNorm ?? 0,
            hazardNorm: sd.hazardNorm ?? 0,
            timeFactor: sd.timeFactor ?? 1,
            structuralVulnFrac: sd.structuralVulnFrac ?? 0,
            impactFrac: sd.impactFrac ?? 0,
            nearbyNorm: sd.nearbyNorm ?? 0,
            wPop: sd.weights?.pop ?? 0.15,
            wHazard: sd.weights?.hazard ?? 0.2,
            wVuln: sd.weights?.vuln ?? 0.15,
            wImpact: sd.weights?.impact ?? 0.25,
            wSilence: sd.weights?.silence ?? 0.15,
            wNearby: sd.weights?.nearby ?? 0.1,
          },
          // Real PostGIS boundary (from the coordinator_barangay_scores view) when present;
          // fall back to a centroid hexagon for any barangay missing geometry.
          geometry: barangay.boundary ?? {
            type: 'Polygon',
            coordinates: [generateBarangayPolygon(barangay)]
          }
        };
      });
      
      barangaysSource.setData({
        type: 'FeatureCollection',
        features: features
      });
      // setData resets feature-state — re-apply the current selection highlight so it
      // survives score refreshes / data reloads.
      if (selectedBarangayIdRef.current) {
        map.setFeatureState(
          { source: 'barangays-source', id: selectedBarangayIdRef.current },
          { selected: true },
        );
      }
    }
  }, [isMapLoaded, mapLayers.barangays, barangays, getScoreData, generateBarangayPolygon, servedBarangayIds]);

  // Selected-barangay highlight via feature-state (no feature rebuild): clear the prior
  // selection and set the new one whenever the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !map.getSource('barangays-source')) return;
    const prev = selectedBarangayIdRef.current;
    if (prev) {
      map.setFeatureState({ source: 'barangays-source', id: prev }, { selected: false });
    }
    const next = selectedBarangay?.id ?? null;
    if (next) {
      map.setFeatureState({ source: 'barangays-source', id: next }, { selected: true });
    }
    selectedBarangayIdRef.current = next;
  }, [selectedBarangay?.id, isMapLoaded]);

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

  // "✕ ROAD BLOCKED" chips on each closed segment — the unmistakable, route-distinct closure
  // marker (color-not-only: shape + label + symbol, not red hue alone). DOM markers render above
  // the canvas, so a chip is never hidden by a line. Built from `edges` (the same client array
  // that feeds roads-source) so it doesn't depend on source paint timing.
  // ── Re-home the map when the country pack changes ──
  // maxBounds must be dropped BEFORE moving: MapLibre clamps any camera change to the
  // current bounds, so flying from Cebu to Da Nang with the Cebu box still set lands the
  // map against the edge of the Philippines instead. New bounds go on after arrival.
  const lastRegionRef = useRef<RegionId>(region);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;
    if (lastRegionRef.current === region) return;
    lastRegionRef.current = region;

    const { center, zoom, bounds } = REGIONS[region];
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    map.setMaxBounds(null);
    const applyBounds = () => map.setMaxBounds(bounds);

    if (reduce) {
      map.jumpTo({ center, zoom });
      applyBounds();
      return;
    }
    // The flight across the sea is the point of the beat — it shows one system moving
    // countries, not a second deployment. `once` so a later pan cannot re-clamp.
    map.once('moveend', applyBounds);
    map.flyTo({ center, zoom, duration: 2600, curve: 1.6, essential: true });
  }, [region, isMapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !maplibreglRef.current) return;
    blockedMarkersRef.current.forEach((m) => m.remove());
    blockedMarkersRef.current = [];
    if (!mapLayers.roads) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const blocked = edges.filter((e) => e.status === 'blocked');

    // Cluster connected closures into ONE chip (a multi-edge closure otherwise stacks chips at every
    // segment midpoint = clutter). Union-find over shared nodes: edges that touch at a sourceNode/
    // targetNode belong to the same closure. Each cluster then gets a single chip.
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
      return r;
    };
    const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
    for (const e of blocked) {
      if (!parent.has(e.sourceNode)) parent.set(e.sourceNode, e.sourceNode);
      if (!parent.has(e.targetNode)) parent.set(e.targetNode, e.targetNode);
      union(e.sourceNode, e.targetNode);
    }
    const clusters = new Map<string, typeof blocked>();
    for (const e of blocked) {
      const root = find(e.sourceNode);
      (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(e);
    }

    for (const group of clusters.values()) {
      // Anchor + label come from the longest edge in the cluster (stable, sits on a real road).
      const anchor = group.reduce((a, b) => (b.lengthM > a.lengthM ? b : a));
      const line = roadGeometries[anchor.id] ?? [
        [anchor.sourceCoords.lng, anchor.sourceCoords.lat],
        [anchor.targetCoords.lng, anchor.targetCoords.lat],
      ];
      if (!line || line.length < 2) continue;
      const mid = line[Math.floor(line.length / 2)] as [number, number];

      const name = anchor.name || 'Road closed';
      const otherNames = new Set(group.map((e) => e.name).filter((n) => n && n !== anchor.name));
      const badge = otherNames.size > 0
        ? `<span style="margin-left:5px;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;
             background:rgba(8,9,11,0.85);color:#fecaca;border:1px solid rgba(254,202,202,0.4)">+${otherNames.size}</span>`
        : '';

      const el = document.createElement('div');
      el.className = `luwas-endpoint luwas-block ${reduce ? '' : 'luwas-block--pulse'}`;
      el.innerHTML =
        `<span class="luwas-endpoint__label" style="color:#fecaca">${name}${badge}</span>
         <span style="display:flex;width:26px;height:26px;border-radius:3px;align-items:center;justify-content:center;
           background:${COLOR.critical};box-shadow:0 0 0 3px rgba(8,9,11,0.9),0 2px 8px rgba(0,0,0,0.55)">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6"
             stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
         </span>`;
      blockedMarkersRef.current.push(
        new maplibreglRef.current.Marker({ element: el }).setLngLat(mid).addTo(map),
      );
    }
  }, [isMapLoaded, mapLayers.roads, edges, roadGeometries]);

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
      const ghostSrc = map.getSource('team-routes-ghost-source') as { setData: (d: unknown) => void } | undefined;
      ghostSrc?.setData({ type: 'FeatureCollection', features: [] });
      ghostLabelMarkersRef.current.forEach((m) => m.remove());
      ghostLabelMarkersRef.current = [];
      return;
    }

    const AVG_SPEED_KMH = 25; // disaster-response convoy avg over degraded roads

    // Per-team active/completed geometry for the ghost capture (keyed by stable teamId — survives
    // the route-id change a reroute causes; see nextGhostState).
    const activeByTeam: Record<string, [number, number][]> = {};
    const completedTeamIds: string[] = [];

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

      // pgRouting path first (block-aware); OSRM snap only as a degenerate-path fallback.
      const coordinates = routeLineCoords(route, teamRouteGeometries[route.id]);

      // Collect per-team geometry for the ghost capture below (by teamId, not route.id).
      if (route.teamId && route.status === 'active') activeByTeam[route.teamId] = coordinates;
      if (route.teamId && route.status === 'completed') completedTeamIds.push(route.teamId);

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

    // Capture/keep ghosts by teamId (survives the route-id change a reroute causes) and publish.
    ghostStateRef.current = nextGhostState(ghostStateRef.current, activeByTeam, completedTeamIds);
    const ghostSrc = map.getSource('team-routes-ghost-source') as { setData: (d: unknown) => void } | undefined;
    // Draw ONLY the parts of each team's old path the new active path doesn't cover, so the ghost
    // (and its label) never sits on top of road shared with the new route. See ghostDivergentSegments.
    const ghostSegmentsByTeam = Object.entries(ghostStateRef.current.ghostByTeam)
      .map(([teamId, ghost]) => ({
        segments: ghostDivergentSegments(ghost, activeByTeam[teamId] ?? []),
      }))
      .filter((g) => g.segments.length > 0);
    ghostSrc?.setData({
      type: 'FeatureCollection',
      features: ghostSegmentsByTeam.flatMap((g) =>
        g.segments.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })),
      ),
    });

    // One "Original route" chip per team, on the midpoint of its longest divergent segment
    // (color-not-only: the faded line + an explicit label).
    ghostLabelMarkersRef.current.forEach((m) => m.remove());
    ghostLabelMarkersRef.current = [];
    if (maplibreglRef.current) {
      for (const g of ghostSegmentsByTeam) {
        const c = g.segments.reduce((a, b) => (b.length > a.length ? b : a));
        const mid = c[Math.floor(c.length / 2)] as [number, number];
        const el = document.createElement('div');
        el.className = 'luwas-endpoint';
        el.innerHTML =
          `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:3px;
             font-size:10px;font-weight:600;white-space:nowrap;
             background:rgba(8,9,11,0.85);color:${ROUTE_ACTIVE};border:1px solid ${ROUTE_ACTIVE}66">
             <span style="width:12px;border-top:2px solid ${ROUTE_ACTIVE};opacity:0.8"></span>Original route</span>`;
        ghostLabelMarkersRef.current.push(
          new maplibreglRef.current.Marker({ element: el }).setLngLat(mid).addTo(map),
        );
      }
    }
  }, [isMapLoaded, mapLayers.routes, routes, teams, teamRouteGeometries]);

  // Provisional dispatch preview: OSRM-snap hub -> area for a responsive line until the real
  // pgRouting route lands (parent nulls dispatchPreview then). OSRM is acceptable here because
  // this is an explicitly provisional indicator, not the block-aware route of record.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;
    const src = map.getSource('dispatch-preview-source') as { setData: (d: unknown) => void } | undefined;
    if (!src) return;
    if (!dispatchPreview) { src.setData({ type: 'FeatureCollection', features: [] }); return; }

    let activePreview = true;
    const { from, to } = dispatchPreview;
    const straight = [[from.lng, from.lat], [to.lng, to.lat]] as [number, number][];
    const draw = (coords: [number, number][]) => {
      if (!activePreview) return;
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] });
    };
    draw(straight); // show instantly; refine with OSRM if it answers

    (async () => {
      try {
        const c = `${from.lng},${from.lat};${to.lng},${to.lat}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${c}?overview=full&geometries=geojson`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const geom = data.routes?.[0]?.geometry?.coordinates;
          if (geom?.length) draw(geom);
        }
      } catch { /* keep the straight provisional line */ }
    })();

    return () => { activePreview = false; };
  }, [isMapLoaded, dispatchPreview]);

  // Emphasized START (HQ) + END (destination) markers per active/planned route. Shape — not
  // just color — distinguishes them (color-not-only); larger + haloed for contrast on the dark
  // map; END pulses while active (motion-meaning, reduced-motion-guarded via CSS).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !maplibreglRef.current) return;
    routeEndpointMarkersRef.current.forEach((m) => m.remove());
    routeEndpointMarkersRef.current = [];
    if (!mapLayers.routes) return;

    const makeEl = (html: string, kind: 'start' | 'end', active: boolean) => {
      const el = document.createElement('div');
      el.className = `luwas-endpoint ${kind === 'end' ? `luwas-end ${active ? 'luwas-end--active' : ''}` : ''}`;
      el.innerHTML = html;
      return el;
    };

    routes.filter((r) => r.status === 'active' || r.status === 'planned').forEach((route) => {
      const coords = routeLineCoords(route, teamRouteGeometries[route.id]);
      if (coords.length < 2) return;
      // Geometry direction is not guaranteed (pgRouting / reroute can emit either order), so
      // anchor HQ to whichever line end is nearest the team base; the other end is the destination.
      const team = teams.find((t) => t.id === route.teamId);
      const c0 = coords[0];
      const cN = coords[coords.length - 1];
      let start = c0;
      let end = cN;
      if (team) {
        const d2 = (c: [number, number]) =>
          (c[0] - team.baseLocation.lng) ** 2 + (c[1] - team.baseLocation.lat) ** 2;
        if (d2(cN) < d2(c0)) {
          start = cN;
          end = c0;
        }
      }
      const destName = route.stops?.[route.stops.length - 1]?.barangayName ?? 'Destination';
      const active = route.status === 'active';

      const startEl = makeEl(
        `<span class="luwas-endpoint__label" style="color:var(--color-active)">HQ</span>
         <span style="display:flex;width:30px;height:30px;border-radius:3px;align-items:center;justify-content:center;
           background:var(--color-active);box-shadow:0 0 0 3px rgba(8,9,11,0.9),0 2px 8px rgba(0,0,0,0.5)">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06281f" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>
         </span>`, 'start', active);

      const endEl = makeEl(
        `<span class="luwas-endpoint__label" style="color:#fff">${destName}</span>
         <span class="luwas-end__ring" style="box-shadow:0 0 0 2px var(--color-critical)"></span>
         <span style="display:flex;width:30px;height:30px;border-radius:9999px 9999px 9999px 2px;rotate:45deg;
           align-items:center;justify-content:center;background:var(--color-critical);
           box-shadow:0 0 0 3px rgba(8,9,11,0.9),0 2px 8px rgba(0,0,0,0.5)">
           <svg style="rotate:-45deg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff"
             stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/>
             <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/></svg>
         </span>`, 'end', active);

      const M = maplibreglRef.current!.Marker;
      routeEndpointMarkersRef.current.push(new M({ element: startEl }).setLngLat(start).addTo(map));
      routeEndpointMarkersRef.current.push(new M({ element: endEl }).setLngLat(end).addTo(map));
    });
  }, [isMapLoaded, routes, teams, mapLayers.routes, teamRouteGeometries]);

  // Demo convoy marker (Part A). A clearly-labelled SIMULATED vehicle eases from HQ along the
  // SAME real-road geometry the route line draws and PARKS short of the destination (never
  // arrives) — decorative motion for the demo narrative, not live telemetry. Honest-by-design:
  // a "sim" pill rides the marker, it stops at stopFraction, and DEMO_CONVOY kills it in one line.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !maplibreglRef.current) return;

    const markers = vehicleMarkersRef.current;
    const state = convoyStateRef.current;
    const M = maplibreglRef.current.Marker;

    // Which routes should carry a convoy right now? (obeys DEMO_CONVOY + the routes layer toggle)
    const activeIds = new Set<string>();
    if (DEMO_CONVOY && mapLayers.routes) {
      routes.filter((r) => r.status === 'active').forEach((r) => activeIds.add(r.id));
    }

    // Drop convoys for routes that are no longer active/present (e.g. mark-reached / complete).
    for (const [id, marker] of markers) {
      if (!activeIds.has(id)) {
        marker.remove();
        markers.delete(id);
        state.delete(id);
      }
    }

    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    routes.filter((r) => activeIds.has(r.id)).forEach((route) => {
      let coords = routeLineCoords(route, teamRouteGeometries[route.id]);
      if (coords.length < 2) return;
      // HQ-anchor so f=0 is always HQ — geometry direction is not guaranteed (reuse endpoint logic).
      const team = teams.find((t) => t.id === route.teamId);
      if (team) {
        const d2 = (c: [number, number]) =>
          (c[0] - team.baseLocation.lng) ** 2 + (c[1] - team.baseLocation.lat) ** 2;
        if (d2(coords[coords.length - 1]) < d2(coords[0])) coords = [...coords].reverse();
      }
      const stop = stopFraction(route.id);

      let entry = state.get(route.id);
      if (!entry) {
        // New convoy: build the marker, record start time so re-renders never restart the ease.
        const el = document.createElement('div');
        el.className = 'luwas-convoy';
        el.innerHTML =
          `<span class="luwas-convoy__icon">${convoyIcon(team?.type)}</span>` +
          `<span class="luwas-convoy__sim">sim</span>`;
        const p0 = pointAtFraction(coords, 0);
        const marker = new M({ element: el }).setLngLat([p0.lng, p0.lat]).addTo(map);
        markers.set(route.id, marker);
        entry = {
          coords, stop, start: performance.now(), parked: false,
          iconEl: el.querySelector('.luwas-convoy__icon'),
        };
        state.set(route.id, entry);
      } else {
        // Existing convoy: refresh geometry (a reroute can change it) but keep the start time.
        entry.coords = coords;
        entry.stop = stop;
      }

      // Reduced motion: place parked at stopFraction with no rAF (static, signals "holding").
      if (reduceMotion) {
        const p = pointAtFraction(coords, stop);
        const marker = markers.get(route.id)!;
        marker.setLngLat([p.lng, p.lat]);
        if (entry.iconEl) entry.iconEl.style.transform = `rotate(${p.bearing}deg)`;
        marker.getElement().classList.add('luwas-convoy--parked');
        entry.parked = true;
      }
    });

    if (reduceMotion) return; // markers placed statically; no animation loop.

    // One shared rAF loop drives ALL convoys (mirror the flow loop). Each parks — stops updating —
    // once it reaches its stopFraction, so there is no per-frame work for a parked convoy.
    // ease-in-out quadratic: gentle start -> steady cruise -> gentle settle. (Cubic peaked at ~3x
    // average speed mid-route, which read as the convoy racing to the middle; quadratic peaks at ~2x
    // and, paired with the longer CONVOY_MS, keeps the advance slow and deliberate throughout.)
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    const tick = () => {
      const now = performance.now();
      for (const [id, entry] of state) {
        if (entry.parked) continue;
        const marker = markers.get(id);
        if (!marker) continue;
        const t = Math.min(1, (now - entry.start) / CONVOY_MS);
        const f = ease(t) * entry.stop;
        const p = pointAtFraction(entry.coords, f);
        marker.setLngLat([p.lng, p.lat]);
        if (entry.iconEl) entry.iconEl.style.transform = `rotate(${p.bearing}deg)`;
        if (t >= 1) {
          entry.parked = true;
          marker.getElement().classList.add('luwas-convoy--parked');
        }
      }
      convoyRafRef.current = requestAnimationFrame(tick);
    };
    convoyRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(convoyRafRef.current);
  }, [isMapLoaded, routes, teams, mapLayers.routes, teamRouteGeometries]);

  // Directional "flow" on active routes (motion-meaning). Steps a dash pattern so the highlight
  // travels depot -> destination. Skipped entirely under prefers-reduced-motion (the static
  // team-routes-line already conveys the path).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      if (map.getLayer('team-routes-flow')) map.setLayoutProperty('team-routes-flow', 'visibility', 'none');
      return;
    }
    const seq = [ [0,4,3],[0.5,4,2.5],[1,4,2],[1.5,4,1.5],[2,4,1],[2.5,4,0.5],[3,4,0],[0,0.5,3,3.5],[0,1,3,3],[0,2,3,2],[0,3,3,1],[0,3.5,3,0.5] ];
    let i = 0, raf = 0, last = 0;
    const tick = (t: number) => {
      if (t - last > 90) { // ~11fps marching ants; cheap
        if (map.getLayer('team-routes-flow')) map.setPaintProperty('team-routes-flow', 'line-dasharray', seq[i % seq.length]);
        i++; last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isMapLoaded]);

  // ── Report pins: a salience ramp, not one mark repeated ──────────────────────
  // Loud tier (critical pending + flagged) and the current selection render as DOM
  // markers, because they need rich shapes and are few. Everything else goes into
  // the reports-dots circle layer. See lib/coordinator/reportPins.ts for why
  // severity — not status — decides which is which.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    reportMarkersRef.current.forEach((m) => m.remove());
    reportMarkersRef.current = [];

    const dotSource = map.getSource('reports-dots-source') as GeoJSONSource | undefined;
    const clearDots = () => dotSource?.setData({ type: 'FeatureCollection', features: [] });

    if (!mapLayers.reports) {
      clearDots();
      return;
    }

    // A dispatched area is already represented by its route destination pin, which would otherwise
    // overlap the report marker. Hide report markers in barangays with an active/planned route;
    // they reappear once the route completes.
    const dispatchedBarangayIds = new Set(
      routes
        .filter((r) => r.status === 'active' || r.status === 'planned')
        .map((r) => r.stops?.[r.stops.length - 1]?.barangayId)
        .filter((id): id is string => Boolean(id)),
    );

    const hoverHtml = (report: FieldReport) => `
      <div class="px-2.5 py-1.5 text-[13px] font-sans max-w-[220px]">
        <div class="flex items-center gap-2 mb-1 border-b border-line pb-1 justify-between">
          <span class="font-mono text-muted text-[12px]">#${report.id}</span>
          <span class="flex items-center gap-1.5 text-[12px] text-muted capitalize">
            <span style="width:6px;height:6px;border-radius:9999px;background:${reportStatusColor(report.status)}"></span>${report.status}
          </span>
        </div>
        <div class="text-fg mb-1 line-clamp-2">"${report.rawText}"</div>
        ${hasTranslation(report) ? `<div class="text-[12px] text-muted mb-1 line-clamp-1">${report.translatedText}</div>` : ''}
        ${report.roadImpassable ? `<div class="text-[12px] mb-1" style="color:${COLOR.warning}">Road reported cut${
          report.status === 'confirmed' ? ' · closed on the map' : ' · confirm to close it on the map'
        }</div>` : ''}
        <div class="text-[12px] text-muted capitalize">Source · ${report.source}</div>
      </div>`;

    const focusReport = (report: FieldReport) => {
      onSelectReport(report);
      setSelectedEdge(null);
      map.flyTo({
        center: [report.longitude, report.latitude],
        zoom: Math.max(map.getZoom(), 13.2), // only zoom in, never out
        essential: true,
        speed: 1.2,
      });
    };

    const visible = reports.filter(
      (r) => !(r.barangayId && dispatchedBarangayIds.has(r.barangayId)),
    );

    const dots: GeoJSON.Feature[] = [];

    for (const report of visible) {
      const tier = reportPinTier(report);
      const isSelected = selectedReport?.id === report.id;

      // The selection is promoted out of the dot field so it can carry a ring —
      // otherwise clicking a 3px dot gives no confirmation that anything happened.
      if (!isLoudTier(tier) && !isSelected) {
        dots.push({
          type: 'Feature',
          properties: { id: report.id, tier }, // promoteId lifts this into the feature id
          geometry: { type: 'Point', coordinates: [report.longitude, report.latitude] },
        });
        continue;
      }

      const el = document.createElement('div');
      el.className = 'cursor-pointer';
      const flagged = report.status === 'flagged';
      // An unconfirmed road closure is the loudest thing in the queue: it is the one
      // report whose confirmation edits the road network, and it speaks for every
      // convoy on that road rather than for one barangay. It gets the selected size
      // even unselected, so it is findable on a map holding hundreds of pins.
      const closure = !flagged && report.roadImpassable;
      const size = isSelected || closure ? 20 : 16;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;

      const fill = flagged ? COLOR.critical : COLOR.warning;
      // Shape and glyph, not hue alone: a flagged report is a diamond, a critical
      // pending one a ringed disc with "!", and a road closure the same disc with "✕"
      // — all three stay apart for a red/green-deficient viewer.
      const shape = flagged
        ? `transform: rotate(45deg); border-radius: 2px;`
        : `border-radius: 50%;`;
      const glyph = flagged
        ? ''
        : `<span style="color:${COLOR.bg};font-size:${closure ? 13 : 11}px;font-weight:700;font-family:sans-serif;line-height:1;">${closure ? '&#10005;' : '!'}</span>`;

      el.innerHTML = `
        <div style="
          background: ${fill};
          ${shape}
          width: ${size}px;
          height: ${size}px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 0 ${isSelected ? '3px' : '2px'} ${COLOR.bg}${isSelected ? `, 0 0 0 ${size / 2}px ${fill}33` : ''};
          outline: ${isSelected ? `1.5px solid ${COLOR.fg}` : 'none'};
          outline-offset: 2px;
        ">${glyph}</div>`;

      el.addEventListener('mouseenter', () => {
        hoverPopupRef.current.remove();
        hoverPopupRef.current
          .setLngLat([report.longitude, report.latitude])
          .setHTML(hoverHtml(report))
          .addTo(map);
      });
      el.addEventListener('mouseleave', () => hoverPopupRef.current.remove());
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        focusReport(report);
      });

      reportMarkersRef.current.push(
        new maplibreglRef.current.Marker({ element: el })
          .setLngLat([report.longitude, report.latitude])
          .addTo(map),
      );
    }

    dotSource?.setData({ type: 'FeatureCollection', features: dots });

    // Dot interaction rides the oversized invisible hit layer. Handlers are bound
    // per-effect and torn down in the cleanup, so they always close over the
    // current reports rather than a stale array.
    const byId = new Map(visible.map((r) => [r.id, r] as const));
    let hoveredDotId: string | null = null;

    const clearDotHover = () => {
      if (hoveredDotId === null) return;
      map.setFeatureState({ source: 'reports-dots-source', id: hoveredDotId }, { hovered: false });
      hoveredDotId = null;
    };

    const onDotMove = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (!id) return;
      map.getCanvas().style.cursor = 'pointer';
      if (hoveredDotId === id) {
        hoverPopupRef.current.setLngLat(e.lngLat);
        return;
      }
      clearDotHover();
      hoveredDotId = id;
      map.setFeatureState({ source: 'reports-dots-source', id }, { hovered: true });
      const report = byId.get(id);
      if (!report) return;
      hoverPopupRef.current.remove();
      hoverPopupRef.current.setLngLat(e.lngLat).setHTML(hoverHtml(report)).addTo(map);
    };

    const onDotLeave = () => {
      clearDotHover();
      map.getCanvas().style.cursor = '';
      hoverPopupRef.current.remove();
    };

    const onDotClick = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      const report = id ? byId.get(id) : undefined;
      if (report) focusReport(report);
    };

    map.on('mousemove', 'reports-dots-hit', onDotMove);
    map.on('mouseleave', 'reports-dots-hit', onDotLeave);
    map.on('click', 'reports-dots-hit', onDotClick);

    return () => {
      map.off('mousemove', 'reports-dots-hit', onDotMove);
      map.off('mouseleave', 'reports-dots-hit', onDotLeave);
      map.off('click', 'reports-dots-hit', onDotClick);
      clearDotHover();
    };
  }, [isMapLoaded, mapLayers.reports, reports, routes, selectedReport, onSelectReport]);

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
          background: #131418;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 3px;
          padding: 3px 5px;
          display: flex;
          align-items: center;
          gap: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        ">
          ${iconMarkup}
          <span style="color:#8C93A0;font-size:9px;font-weight:600;font-family:var(--font-plex-mono),monospace;">${label}</span>
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

    volunteers.forEach((vol) => {
      const fill = volColor(vol.availability);
      const el = document.createElement('div');
      el.className = 'cursor-pointer';
      
      el.innerHTML = `
        <div style="
          background: #131418;
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
  }, [isMapLoaded, mapLayers.volunteers, volunteers]);

  // ── Interactive Hub Markers (SVGs categorized by Hub Type) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    hubMarkersRef.current.forEach((m) => m.remove());
    hubMarkersRef.current = [];

    if (!mapLayers.hubs) return;

    facilities.forEach((hub) => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer';
      
      let hubColor = MAP.HUB;
      let iconMarkup = '';

      if (hub.type === 'shelter') {
        hubColor = MAP.HUB;
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        `;
      } else if (hub.type === 'supply_hub') {
        hubColor = MAP.HUB;
        iconMarkup = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
            <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
          </svg>
        `;
      } else {
        // Warehouse (Large Depot)
        hubColor = MAP.HUB;
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
          border-radius: 3px;
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
              <div class="text-[12px] text-muted mt-0.5">Capacity · <span class="text-fg font-mono tabular-nums">${hub.capacityPercent ? `${hub.capacityPercent}%` : '—'}</span></div>
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
  }, [isMapLoaded, mapLayers.hubs, facilities]);

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
    toggleLayer('roads-layer-blocked-casing', mapLayers.roads);
    toggleLayer('roads-layer-blocked', mapLayers.roads);
    toggleLayer('team-routes-casing', mapLayers.routes);
    toggleLayer('team-routes-ghost', mapLayers.routes);
    toggleLayer('team-routes-line', mapLayers.routes);
    toggleLayer('team-routes-flow', mapLayers.routes);
    toggleLayer('team-routes-line-planned', mapLayers.routes);
    toggleLayer('dispatch-preview-line', mapLayers.routes);
    // The pin effect already empties the dot source when reports are toggled off;
    // hiding the layers as well keeps this list the single place to answer "what
    // does the Reports toggle control", and takes the hit layer out of the
    // hover/click path rather than leaving an invisible target behind.
    toggleLayer('reports-dots', mapLayers.reports);
    toggleLayer('reports-dots-hit', mapLayers.reports);
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

  // Crosshair cursor while "Block road" mode is armed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;
    map.getCanvas().style.cursor = blockMode ? 'crosshair' : '';
  }, [blockMode, isMapLoaded]);

  // ── Zoom helpers ──
  const zoomIn    = () => mapRef.current?.zoomIn();
  const zoomOut   = () => mapRef.current?.zoomOut();
  const resetView = () =>
    mapRef.current?.easeTo({ center: REGIONS[region].center, zoom: REGIONS[region].zoom });

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
        /* Tooltip styling — calm surface; inner HTML controls padding. Width is fixed
           here (box-sizing: border-box) so content can never spill past the bubble. */
        .command-map-tooltip .maplibregl-popup-content {
          width: 264px !important;
          max-width: 264px !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          background-color: var(--color-raised) !important;
          color: var(--color-fg) !important;
          border: 1px solid var(--color-line) !important;
          border-radius: 4px !important;
          padding: 0 !important;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45) !important;
        }
        .command-map-tooltip .maplibregl-popup-tip {
          border-top-color: var(--color-raised) !important;
          border-bottom-color: var(--color-raised) !important;
        }
        /* CARTO attribution chip — required by their terms; retinted to graphite. */
        .maplibregl-ctrl-attrib { background: rgba(10, 11, 13, 0.7) !important; font: 10px/1.4 var(--font-sans); }
        .maplibregl-ctrl-attrib, .maplibregl-ctrl-attrib a { color: var(--color-muted) !important; }
        /* Metric scale bar — telemetry accent, retinted to graphite. */
        .maplibregl-ctrl-scale {
          background: rgba(10, 11, 13, 0.7) !important;
          border-color: var(--color-muted) !important;
          color: var(--color-muted) !important;
          font: 10px/1.6 var(--font-mono) !important;
        }
      `}</style>

      {/* Header */}
      <div className="bg-surface border-b border-line px-4 h-10 flex items-center justify-between z-10 select-none">
        <div className="flex items-center gap-2.5">
          <Compass className="w-4 h-4 text-muted" />
          <span className="text-[14px] font-medium text-fg">Live Operations Map</span>
          {onResetReports && (
            <button
              onClick={() => {
                onResetReports();
                onSelectReport(null as unknown as FieldReport);
                setSelectedEdge(null);
              }}
              className="ml-2 px-2 py-1 text-[12px] text-muted hover:text-fg hover:bg-raised rounded-control transition-colors duration-100 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 text-[12px]">
          {cursorLngLat && (
            <span className="mr-2 hidden xl:inline text-[11px] font-mono tabular-nums text-muted select-none">
              {cursorLngLat.lat.toFixed(4)}°N {cursorLngLat.lng.toFixed(4)}°E
            </span>
          )}
          {onBlockRoadAt && (
            <button
              onClick={() => setBlockMode((v) => !v)}
              title="Click a road on the map to mark it blocked"
              className={`mr-1.5 px-2 py-1 rounded-control transition-colors duration-100 cursor-pointer ${
                blockMode
                  ? 'bg-critical/15 text-critical border border-critical/40'
                  : 'text-muted hover:text-fg hover:bg-raised/40 border border-transparent'
              }`}
            >
              {blockMode ? 'Click a road…' : 'Block road'}
            </button>
          )}
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

        {/* Country pack switch. Bottom-left is the only free corner, and it keeps the
            switch away from the selection stack so changing country is never a misclick
            while inspecting an area. */}
        {onSelectRegion && (
          <div className="absolute bottom-4 left-4 z-10 select-none">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Region
            </div>
            <div
              role="radiogroup"
              aria-label="Region"
              className="flex overflow-hidden rounded-control border border-line bg-surface shadow-overlay"
            >
              {REGION_LIST.map((r) => {
                const isActive = r.id === region;
                return (
                  <button
                    key={r.id}
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => !isActive && onSelectRegion(r.id)}
                    title={`${r.label}, ${r.country} — intake over ${r.intakeChannel}`}
                    className={
                      'px-3 py-1.5 text-xs font-semibold transition-colors duration-100 cursor-pointer '
                      + (isActive
                        ? 'bg-raised text-fg'
                        : 'text-muted hover:bg-raised/60 hover:text-fg')
                    }
                  >
                    {r.label}
                    <span className="ml-1.5 font-normal text-[10px] text-muted">{r.country}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          <button
            onClick={zoomIn}
            title="Zoom In"
            className="w-7 h-7 bg-surface border border-line hover:bg-raised text-muted hover:text-fg rounded-control flex items-center justify-center text-sm cursor-pointer transition-colors duration-100 select-none"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            title="Zoom Out"
            className="w-7 h-7 bg-surface border border-line hover:bg-raised text-muted hover:text-fg rounded-control flex items-center justify-center text-sm cursor-pointer transition-colors duration-100 select-none"
          >
            −
          </button>
          <button
            onClick={resetView}
            title="Reset"
            className="w-7 h-7 bg-surface border border-line hover:bg-raised text-muted hover:text-fg rounded-control flex items-center justify-center text-sm cursor-pointer transition-colors duration-100 select-none"
          >
            ⌂
          </button>
        </div>

        {/* Top-left context stack — everything that answers "what is selected".
            One column beside the fullscreen button, because a barangay, a report
            and a road edge can all be selected at once (selecting a barangay also
            selects its pending report), and three siblings hardcoded to the same
            top-3 left-12 used to render on top of each other. */}
        <div className="absolute top-3 left-12 z-10 w-[300px] flex flex-col gap-2">
          {selectedBarangay && (
            <SilentWatchChip
              name={selectedBarangay.name}
              cityMunicipality={selectedBarangay.cityMunicipality}
              served={servedBarangayIds.has(selectedBarangay.id)}
              hoursSinceContact={
                scores.find((s) => s.barangayId === selectedBarangay.id)?.hoursSinceContact ?? null
              }
              lastConfirmedContact={selectedBarangay.lastConfirmedContact}
              operationStartedAt={operationStartedAt}
              unverifiedReports={unverifiedForSelected}
            />
          )}

        {/* Road edge popup */}
        {selectedEdge && (
          <div className="w-full bg-surface border border-line p-3.5 rounded-card text-[13px] flex flex-col gap-2.5">
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
                        active ? activeStyles[s] : 'border-line-strong text-muted hover:bg-raised/40 hover:text-fg'
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
                className="w-full bg-bg border border-line-strong p-2 rounded-control text-[13px] text-fg placeholder:text-muted focus:outline-none focus:border-muted resize-none h-14"
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

        {/* Report popup */}
        {selectedReport && (
          <div className="w-full bg-surface border border-line p-3.5 rounded-card text-[13px] flex flex-col gap-2.5">
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
                  {new Date(selectedReport.createdAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Manila',
                  })}
                </span>
              </div>

              {(() => {
                const translated = hasTranslation(selectedReport);
                const showingOriginal = reportOriginalId === selectedReport.id || !translated;
                return (
                  <div className="space-y-1.5">
                    {translated && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted">
                          {showingOriginal ? 'Original' : 'Translated · machine'}
                        </span>
                        <button
                          onClick={() =>
                            setReportOriginalId((cur) => (cur === selectedReport.id ? null : selectedReport.id))
                          }
                          className="text-[12px] text-active hover:underline cursor-pointer"
                        >
                          {showingOriginal ? 'Show translation' : 'Show original'}
                        </button>
                      </div>
                    )}
                    <div className="bg-bg border border-line p-2.5 rounded-control text-[13px] text-fg leading-relaxed">
                      &ldquo;{showingOriginal ? selectedReport.rawText : selectedReport.translatedText}&rdquo;
                    </div>
                  </div>
                );
              })()}

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
        </div>

        {/* Updated Legend Panel (Hub colors explicit to display the 3 distinct types) */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1.5 select-none">
          {legendOpen && (
            <div className="bg-surface border border-line p-3 rounded-card text-[12px] text-muted flex flex-col gap-3 w-[168px]">
              <div>
                <div className="text-[11px] text-muted mb-1.5">Barangay state</div>
                <div className="space-y-1">
                  {[
                    { color: COLOR.stable, label: 'Stable' },
                    { color: COLOR.warning, label: 'Escalating' },
                    { color: COLOR.critical, label: 'Critical' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-fg">{label}</span>
                    </div>
                  ))}
                  {/* Reached is orthogonal to the priority scale — a delivered-to community. */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-2 h-2 shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={SERVED_COLOR} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                    <span className="text-fg">{SERVED_LABEL}</span>
                  </div>
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
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] shrink-0"
                      style={{ background: COLOR.critical }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </span>
                    <span className="text-fg">Blocked (closure)</span>
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
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-0.5 inline-block shrink-0" style={{ background: ROUTE_ACTIVE, opacity: 0.5 }} />
                    <span className="text-fg">Original (rerouted)</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-line pt-2">
                <div className="text-[11px] text-muted mb-1.5">Reports</div>
                {/* Ordered loudest-first, and the swatches carry the real size and
                    opacity ramp — a legend of five identical dots would describe a
                    map that no longer exists. */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 flex items-center justify-center font-bold leading-none"
                      style={{ background: COLOR.warning, color: COLOR.bg, fontSize: 8, boxShadow: `0 0 0 1.5px ${COLOR.bg}` }}
                    >✕</span>
                    <span className="text-fg">Road cut · unverified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: COLOR.warning, boxShadow: `0 0 0 1.5px ${COLOR.bg}` }}
                    />
                    <span className="text-fg">Critical · unverified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rotate-45 rounded-[1px] shrink-0"
                      style={{ background: COLOR.critical }}
                    />
                    <span className="text-fg">Flagged</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: COLOR.warning, opacity: DOT_OPACITY.elevated }}
                    />
                    <span className="text-fg">High severity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: COLOR.muted, opacity: DOT_OPACITY.routine }}
                    />
                    <span className="text-fg">In queue</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1 h-1 rounded-full shrink-0"
                      style={{ background: COLOR.muted, opacity: DOT_OPACITY.done }}
                    />
                    <span className="text-fg">Verified</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-line pt-2">
                <div className="text-[11px] text-muted mb-1.5">Assets</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2 rounded-sm inline-block shrink-0" style={{ background: MAP.HUB, border: '1px solid rgba(232,238,249,0.35)' }} />
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