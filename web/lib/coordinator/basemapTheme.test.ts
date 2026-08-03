import { describe, expect, it, vi } from 'vitest';
import { applyGraphiteBasemap, BASEMAP, type StyleLayer } from './basemapTheme';

function fakeMap(layers: StyleLayer[]) {
  return {
    getStyle: () => ({ layers }),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    addLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue(undefined),
  };
}

describe('applyGraphiteBasemap', () => {
  it('re-paints background, water, roads and labels; hides POI symbols', () => {
    const map = fakeMap([
      { id: 'background', type: 'background' },
      { id: 'water', type: 'fill', source: 'carto', 'source-layer': 'water' },
      { id: 'road_minor', type: 'line', source: 'carto', 'source-layer': 'transportation' },
      { id: 'poi_label', type: 'symbol', source: 'carto', 'source-layer': 'poi' },
      { id: 'place_city', type: 'symbol', source: 'carto', 'source-layer': 'place' },
    ]);
    applyGraphiteBasemap(map);
    expect(map.setPaintProperty).toHaveBeenCalledWith('background', 'background-color', BASEMAP.bg);
    expect(map.setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', BASEMAP.water);
    expect(map.setPaintProperty).toHaveBeenCalledWith('road_minor', 'line-color', BASEMAP.road);
    expect(map.setLayoutProperty).toHaveBeenCalledWith('poi_label', 'visibility', 'none');
    expect(map.setPaintProperty).toHaveBeenCalledWith('place_city', 'text-color', BASEMAP.labelText);
    // coastline hint reuses the water layer's source
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'luwas-coastline', type: 'line', source: 'carto', 'source-layer': 'water' }),
      expect.anything(),
    );
  });

  it('survives a layer that throws (stock paint kept, no crash)', () => {
    const map = fakeMap([{ id: 'weird', type: 'fill', 'source-layer': 'water' }]);
    map.setPaintProperty = vi.fn(() => { throw new Error('unknown property'); });
    expect(() => applyGraphiteBasemap(map)).not.toThrow();
  });
});
