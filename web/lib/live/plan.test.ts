import { describe, it, expect } from 'vitest';
import { routeRowToUi, predictionRowToUi, manifestRowToUi, depotStockFromRows } from './plan';

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
  expect(p.isDay0).toBe(false); // report-driven rows are not Day-0
});

it('carries the affected interval bounds onto the UI prediction', () => {
  const p = predictionRowToUi({ barangay_id: 'b1', model: 'tabpfn', predicted_affected: 1200,
    damage_severity: 'high', confidence: 0.8, override_value: null, inputs: {},
    affected_low: 820, affected_high: 1740 });
  expect(p.affectedLow).toBe(820);
  expect(p.affectedHigh).toBe(1740);
});

it('leaves interval bounds null for heuristic rows (no interval persisted)', () => {
  const p = predictionRowToUi({ barangay_id: 'b1', model: 'heuristic', predicted_affected: 500,
    damage_severity: 'moderate', confidence: 0.25, override_value: null, inputs: {},
    affected_low: null, affected_high: null });
  expect(p.affectedLow).toBeNull();
  expect(p.affectedHigh).toBeNull();
});

it('flags Day-0 predictions via is_day0', () => {
  const p = predictionRowToUi({ barangay_id: 'b1', model: 'tabpfn', predicted_affected: 500,
    damage_severity: 'high', confidence: 0.8, override_value: null, inputs: {}, is_day0: true });
  expect(p.isDay0).toBe(true);
});

it('converts a manifest row to the UI SupplyManifest', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 45000, food_packs: 500,
    shelter_kits: 100, blankets: 200, breakdown: { lines: [] }, overridden: false });
  expect(m.waterL.recommended).toBe(45000);
  expect(m.status).toBe('pending');
});

it('reads the persisted manifest review status', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 45000, food_packs: 500,
    shelter_kits: 100, blankets: 200, breakdown: { lines: [] }, overridden: false,
    status: 'approved' });
  expect(m.status).toBe('approved');
});

it('falls back to overridden-derived status when the column is absent', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 1, food_packs: 1,
    shelter_kits: 0, blankets: 0, breakdown: { lines: [] }, overridden: true });
  expect(m.status).toBe('modified');
});

it('ignores an unrecognised status value', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 1, food_packs: 1,
    shelter_kits: 0, blankets: 0, breakdown: { lines: [] }, overridden: false,
    status: 'garbage' });
  expect(m.status).toBe('pending');
});

it('carries the manifest total weight when the breakdown has one', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 45000, food_packs: 500,
    shelter_kits: 100, blankets: 200, overridden: false,
    breakdown: { lines: [], total_weight_kg: 48200 } });
  expect(m.totalWeightKg).toBe(48200);
});

it('reports a null total weight when the breakdown has none', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 45000, food_packs: 500,
    shelter_kits: 100, blankets: 200, overridden: false, breakdown: { lines: [] } });
  expect(m.totalWeightKg).toBeNull();
});

it('reads blankets, hygiene and medical off the row and the stored breakdown', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 45000, food_packs: 3000,
    shelter_kits: 400, blankets: 1000, overridden: false,
    breakdown: { lines: [{ item: 'Hygiene kits', quantity: 200 },
                         { item: 'Medical kits', quantity: 1 }] } });
  expect(m.blankets.recommended).toBe(1000);
  expect(m.hygieneKits.recommended).toBe(200);
  expect(m.medicalSupplies.recommended).toBe(1);
});

it('covers manifest lines from the depot stock pool', () => {
  const stock = depotStockFromRows([
    { item_key: 'water_l', quantity: 30000 },
    { item_key: 'blankets', quantity: 1500 },
  ]);
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 45000, food_packs: 3000,
    shelter_kits: 400, blankets: 1000, breakdown: { lines: [] }, overridden: false }, stock);
  // Partly stocked: the shortfall is what the depot cannot cover.
  expect(m.waterL.inventory).toBe(30000);
  expect(m.waterL.shortfall).toBe(15000);
  // Fully stocked lines carry no shortfall, even with surplus on hand.
  expect(m.blankets.shortfall).toBe(0);
  // An item absent from the pool is 0 on hand, not covered.
  expect(m.foodPacks.inventory).toBe(0);
  expect(m.foodPacks.shortfall).toBe(3000);
});

it('treats a missing depot stock pool as nothing on hand', () => {
  const m = manifestRowToUi({ barangay_id: 'b1', days: 3, water_l: 45000, food_packs: 500,
    shelter_kits: 100, blankets: 200, breakdown: { lines: [] }, overridden: false });
  expect(m.waterL.inventory).toBe(0);
  expect(m.waterL.shortfall).toBe(45000);
});
