'use client';

import { useEffect, useRef, useState } from 'react';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { useConnectivity } from '@/lib/live/connectivity';
import { toggleEdge } from '@/lib/volunteer/roadSelection';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// A rounded 12-gon "section" around the barangay centroid — fallback only, used when the real
// PostGIS boundary isn't available. Radius adapts to enclose the roads.
function barangayRing(lng: number, lat: number, radius: number): [number, number][] {
  const ring = Array.from({ length: 12 }, (_, i) => {
    const rad = (i * 30 * Math.PI) / 180;
    return [lng + Math.cos(rad) * radius, lat + Math.sin(rad) * radius] as [number, number];
  });
  ring.push(ring[0]);
  return ring;
}

export default function BlockedRoadPicker({
  barangayId, selectedEdgeIds, onChange,
}: { barangayId: string; selectedEdgeIds: number[]; onChange: (ids: number[]) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const tier = useConnectivity();

  // Keep onChange/selection in refs so the click handler (bound once) sees current values.
  const selRef = useRef(selectedEdgeIds);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    selRef.current = selectedEdgeIds;
    onChangeRef.current = onChange;
  }, [selectedEdgeIds, onChange]);

  useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | null = null;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      const res = await fetch(`/api/barangay-roads?barangayId=${barangayId}`).catch(() => null);
      if (cancelled) return;
      if (!res?.ok) { setStatus('error'); return; }
      const fc = await res.json();
      if (!fc.features?.length) { setStatus('empty'); return; }

      map = new maplibregl.Map({
        container: containerRef.current!,
        style: MAP_STYLE,
        // OSM/CARTO tile licences require visible attribution; compact keeps it out of the
        // way on a small picker. The coordinator map already renders the full form.
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.on('load', () => {
        if (cancelled || !map) return;

        // Roads bounds first — they seed the fitBounds; the boundary extends them below.
        const bounds = new maplibregl.LngLatBounds();
        for (const f of fc.features) {
          const g = f.geometry; if (!g) continue;
          const cs = g.type === 'MultiLineString' ? g.coordinates.flat() : g.coordinates;
          for (const c of cs) bounds.extend(c as [number, number]);
        }

        // ── Barangay boundary (real PostGIS polygon; synthetic ring only if missing) ──
        const b = fc.barangay as { name: string | null; lat: number; lng: number } | null;
        const boundary = fc.boundary as GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
        const labelAt: [number, number] | null = b ? [b.lng, b.lat] : null;

        const boundaryFeature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = boundary
          ? { type: 'Feature', properties: { name: b?.name ?? '' }, geometry: boundary }
          : (b ? { type: 'Feature', properties: { name: b.name ?? '' },
                   geometry: { type: 'Polygon', coordinates: [barangayRing(b.lng, b.lat, 0.006)] } } : null);

        if (boundaryFeature) {
          // Extend bounds to the boundary so it always frames the roads.
          const coords = boundaryFeature.geometry.type === 'MultiPolygon'
            ? (boundaryFeature.geometry.coordinates as number[][][][]).flat(2)
            : (boundaryFeature.geometry.coordinates as number[][][]).flat();
          for (const c of coords) bounds.extend(c as [number, number]);

          map.addSource('picker-barangay', { type: 'geojson', data: boundaryFeature });
          map.addLayer({ id: 'picker-barangay-fill', type: 'fill', source: 'picker-barangay',
            paint: { 'fill-color': '#14b8a6', 'fill-opacity': 0.08 } });
          map.addLayer({ id: 'picker-barangay-outline', type: 'line', source: 'picker-barangay',
            paint: { 'line-color': '#2dd4bf', 'line-width': 2, 'line-opacity': 0.7 } });
          if (labelAt) {
            map.addSource('picker-barangay-label', { type: 'geojson', data: {
              type: 'Feature', properties: { name: b?.name ?? '' }, geometry: { type: 'Point', coordinates: labelAt } } });
            map.addLayer({ id: 'picker-barangay-label', type: 'symbol', source: 'picker-barangay-label',
              layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                'text-size': 13, 'text-anchor': 'center' },
              paint: { 'text-color': '#5eead4', 'text-halo-color': '#0b1220', 'text-halo-width': 1.8 } });
          }
        }

        // ── Roads on top: dark casing + a clear line; selected = thicker + amber (color-not-only) ──
        map.addSource('picker-roads', { type: 'geojson', data: fc, promoteId: 'id' });
        map.addLayer({ id: 'picker-roads-casing', type: 'line', source: 'picker-roads',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-width': 7, 'line-color': '#0b1220', 'line-opacity': 0.9 } });
        map.addLayer({ id: 'picker-roads', type: 'line', source: 'picker-roads',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 6, 4],
            'line-color': ['case',
              ['boolean', ['feature-state', 'selected'], false], '#f59e0b',
              ['get', 'impassable'], '#ef4444', '#5eead4'] } });
        // Transparent wide hit-line keeps taps forgiving (touch-target-chart, no-precision-required).
        map.addLayer({ id: 'picker-roads-hit', type: 'line', source: 'picker-roads',
          paint: { 'line-width': 22, 'line-color': '#000', 'line-opacity': 0.01 } });

        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        map.fitBounds(bounds, { padding: 28, maxZoom: 16, animate: !reduce });
        selRef.current.forEach((id) => map!.setFeatureState({ source: 'picker-roads', id }, { selected: true }));

        map.on('mouseenter', 'picker-roads-hit', () => { map!.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'picker-roads-hit', () => { map!.getCanvas().style.cursor = ''; });
        map.on('click', 'picker-roads-hit', (e) => {
          const f = e.features?.[0]; if (!f || f.id == null) return;
          if (f.properties?.impassable) { setSelectedName(`${f.properties?.name ?? 'This road'} — already reported`); return; }
          const id = Number(f.id);
          const next = toggleEdge(selRef.current, id);
          onChangeRef.current(next);
          map!.setFeatureState({ source: 'picker-roads', id }, { selected: next.includes(id) });
          setSelectedName(next.includes(id) ? (f.properties?.name as string) || 'Road' : null);
        });
        setStatus('ready');
      });
    })();
    return () => { cancelled = true; map?.remove(); mapRef.current = null; };
  }, [barangayId]);

  return (
    <div className="overflow-hidden rounded-control border border-line bg-raised">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
        <div className="text-[13px] font-medium text-fg">Tap the road(s) that are blocked</div>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-1 rounded-full" style={{ background: '#5eead4' }} />Open</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-1 rounded-full" style={{ background: '#f59e0b' }} />Selected</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-1 rounded-full" style={{ background: '#ef4444' }} />Blocked</span>
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="h-[58vh] min-h-[340px] sm:h-[440px] w-full" />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-raised/80 text-[12px] text-muted animate-pulse">
            Loading roads…
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[12px]">
        <span className="text-muted truncate">
          {status === 'loading' && 'Loading roads…'}
          {status === 'ready' && (selectedName ? `✓ ${selectedName}` : 'Tap a road to flag it as blocked.')}
          {status === 'empty' && 'No mapped roads here — your GPS location will be used.'}
          {status === 'error' && (tier === 'offline'
            ? 'Offline — we’ll use your GPS location instead.'
            : 'Couldn’t load roads — your GPS location will be used.')}
        </span>
        {selectedEdgeIds.length > 0 && (
          <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning">
            {selectedEdgeIds.length} road{selectedEdgeIds.length > 1 ? 's' : ''} selected
          </span>
        )}
      </div>
    </div>
  );
}
