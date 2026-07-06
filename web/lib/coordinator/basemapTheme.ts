// Graphite re-paint of the CARTO dark-matter VECTOR basemap (no raster/satellite
// sources, ever). Layers are classified by type + source-layer pattern instead of
// hardcoded CARTO layer ids, so a style revision upstream degrades to stock paint
// on unmatched layers rather than breaking the map. Keep in the tokens family:
// values here are the map-canvas siblings of ui/tokens.ts COLOR.

export const BASEMAP = {
  bg: '#0A0B0D',        // one step darker than --color-bg: panels float sans shadows
  water: '#10141A',     // lighter+cooler than land so the coastline reads
  coast: '#2A3140',     // subtle coastline hint (line over the water source-layer)
  land: '#0D0E11',      // landcover/park/landuse — barely-there terrain texture
  road: '#1E2127',      // basemap roads: below the ROAD_OPEN overlay in contrast
  boundary: '#2C3038',
  building: '#111318',
  labelText: '#737A87', // dim places; LUWAS pins/labels stay highest-contrast
  labelHalo: '#0A0B0D',
} as const;

type StyleLayer = {
  id: string;
  type: string;
  source?: string;
  'source-layer'?: string;
};

// Structural subset of maplibre's Map — lets unit tests pass a plain fake.
export type BasemapTarget = {
  getStyle(): { layers?: StyleLayer[] } | undefined;
  setPaintProperty(layerId: string, name: string, value: unknown): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
  addLayer(layer: object, beforeId?: string): unknown;
  getLayer(id: string): unknown;
};

export function applyGraphiteBasemap(map: BasemapTarget): void {
  const layers = map.getStyle()?.layers ?? [];
  let waterLayer: StyleLayer | undefined;
  let firstSymbolId: string | undefined;

  for (const layer of layers) {
    const key = `${layer['source-layer'] ?? ''} ${layer.id}`.toLowerCase();
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', BASEMAP.bg);
      } else if (layer.type === 'fill' && /water/.test(key)) {
        map.setPaintProperty(layer.id, 'fill-color', BASEMAP.water);
        waterLayer ??= layer;
      } else if (layer.type === 'fill' && /building/.test(key)) {
        map.setPaintProperty(layer.id, 'fill-color', BASEMAP.building);
      } else if (layer.type === 'fill' && /land|park|grass|wood|cemetery|pitch|sand/.test(key)) {
        map.setPaintProperty(layer.id, 'fill-color', BASEMAP.land);
      } else if (layer.type === 'line' && /boundary|admin/.test(key)) {
        map.setPaintProperty(layer.id, 'line-color', BASEMAP.boundary);
      } else if (layer.type === 'line' && /water/.test(key)) {
        map.setPaintProperty(layer.id, 'line-color', BASEMAP.coast);
      } else if (layer.type === 'line' && /road|transport|street|highway|bridge|tunnel|rail/.test(key)) {
        map.setPaintProperty(layer.id, 'line-color', BASEMAP.road);
      } else if (layer.type === 'symbol' && /poi|transit|airport|housenum/.test(key)) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
        continue;
      } else if (layer.type === 'symbol') {
        if (!firstSymbolId) firstSymbolId = layer.id;
        map.setPaintProperty(layer.id, 'text-color', BASEMAP.labelText);
        map.setPaintProperty(layer.id, 'text-halo-color', BASEMAP.labelHalo);
      }
    } catch {
      // Unmatched/unknown layer shape — leave its stock paint.
    }
  }

  // Coastline hint: one thin line over the SAME vector water source (no new sources).
  if (waterLayer?.source && !map.getLayer('luwas-coastline')) {
    try {
      map.addLayer(
        {
          id: 'luwas-coastline',
          type: 'line',
          source: waterLayer.source,
          'source-layer': waterLayer['source-layer'],
          paint: { 'line-color': BASEMAP.coast, 'line-width': 0.8, 'line-opacity': 0.6 },
        },
        firstSymbolId,
      );
    } catch {
      // Missing source-layer in a future style revision — hint is optional.
    }
  }
}
