'use client';

import { useEffect, useRef, useState } from 'react';
import { useConnectivity } from '@/lib/live/connectivity';
import { toggleEdge } from '@/lib/volunteer/roadSelection';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function BlockedRoadPicker({
  barangayId, selectedEdgeIds, onChange,
}: { barangayId: string; selectedEdgeIds: number[]; onChange: (ids: number[]) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const tier = useConnectivity();

  // Keep onChange/selection in refs so the click handler (bound once) sees current values.
  const selRef = useRef(selectedEdgeIds); selRef.current = selectedEdgeIds;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

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
        attributionControl: false,
      });
      mapRef.current = map;
      map.on('load', () => {
        if (cancelled || !map) return;
        map.addSource('picker-roads', { type: 'geojson', data: fc, promoteId: 'id' });
        map.addLayer({ id: 'picker-roads', type: 'line', source: 'picker-roads',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-width': 3,
            'line-color': ['case',
              ['boolean', ['feature-state', 'selected'], false], '#f59e0b',
              ['get', 'impassable'], '#ef4444', '#5eead4'] } });
        map.addLayer({ id: 'picker-roads-hit', type: 'line', source: 'picker-roads',
          paint: { 'line-width': 22, 'line-color': '#000', 'line-opacity': 0.01 } });

        const bounds = new maplibregl.LngLatBounds();
        for (const f of fc.features) {
          const g = f.geometry; if (!g) continue;
          const cs = g.type === 'MultiLineString' ? g.coordinates.flat() : g.coordinates;
          for (const c of cs) bounds.extend(c as [number, number]);
        }
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        map.fitBounds(bounds, { padding: 28, maxZoom: 16, animate: !reduce });
        selRef.current.forEach((id) => map!.setFeatureState({ source: 'picker-roads', id }, { selected: true }));

        map.on('mouseenter', 'picker-roads-hit', () => { map!.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'picker-roads-hit', () => { map!.getCanvas().style.cursor = ''; });
        map.on('click', 'picker-roads-hit', (e) => {
          const f = e.features?.[0]; if (!f || f.id == null) return;
          if (f.properties?.impassable) return; // already reported
          const id = Number(f.id);
          const next = toggleEdge(selRef.current, id);
          onChangeRef.current(next);
          map!.setFeatureState({ source: 'picker-roads', id }, { selected: next.includes(id) });
        });
        setStatus('ready');
      });
    })();
    return () => { cancelled = true; map?.remove(); mapRef.current = null; };
  }, [barangayId]);

  return (
    <div className="overflow-hidden rounded-control border border-line bg-raised">
      <div ref={containerRef} className="h-[240px] w-full" />
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[12px]">
        <span className="text-muted">
          {status === 'loading' && 'Loading roads…'}
          {status === 'ready' && 'Tap the road(s) that are blocked.'}
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
