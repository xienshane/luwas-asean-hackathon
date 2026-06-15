import { describe, it, expect } from 'vitest';
import { routeRowToUi, predictionRowToUi, manifestRowToUi } from './plan';

it('converts a route row (GeoJSON) to a UI Route with a lat/lng path', () => {
  const r = routeRowToUi({ id: 'r1', team_id: 't1', team_name: 'Truck 1', status: 'planned',
    total_distance_m: 1234, stops: [{ sequence: 1, barangayId: 'b1', barangayName: 'Lahug', action: 'x' }],
    geometry: { type: 'LineString', coordinates: [[123.9, 10.3], [123.91, 10.31]] } });
  expect(r.path[0]).toEqual({ lat: 10.3, lng: 123.9 });
  expect(r.stops[0].barangayName).toBe('Lahug');
});

it('converts a prediction row to the UI ImpactPrediction', () => {
  const p = predictionRowToUi({ barangay_id: 'b1', model: 'tabpfn', predicted_affected: 500,
    damage_severity: 'high', confidence: 0.8, override_value: null, inputs: {} });
  expect(p).toMatchObject({ barangayId: 'b1', predictedAffected: 500, damageSeverity: 'moderate' });
  // map DB severity vocab -> UI: low/moderate->minor, high->moderate, severe->severe
});

it('converts a manifest row to the UI SupplyManifest', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 45000, food_packs: 500,
    shelter_kits: 100, blankets: 200, breakdown: { lines: [] }, overridden: false });
  expect(m.waterL.recommended).toBe(45000);
  expect(m.status).toBe('pending');
});
