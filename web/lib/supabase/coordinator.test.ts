import { describe, it, expect } from 'vitest';
import { teamRowToUi, roadStatusRowToEdge, facilityRowToHub } from './coordinator';

it('maps a coordinator_teams row to the UI Team', () => {
  const t = teamRowToUi({ id: 't1', name: 'Truck 1', capacity_kg: 5000, status: 'idle', type: 'truck', base_lat: 10.3, base_lng: 123.9 });
  expect(t).toMatchObject({ id: 't1', name: 'Truck 1', capacityKg: 5000, type: 'truck', baseLocation: { lat: 10.3, lng: 123.9 } });
});

it('maps a road-status row (GeoJSON line) to a RoadEdge with endpoints', () => {
  const e = roadStatusRowToEdge({ id: 5, name: 'X St', length_m: 100, impassable: true,
    geometry: { type: 'LineString', coordinates: [[123.9, 10.3], [123.91, 10.31]] } });
  expect(e.status).toBe('blocked');
  expect(e.sourceCoords).toEqual({ lat: 10.3, lng: 123.9 });
  expect(e.targetCoords).toEqual({ lat: 10.31, lng: 123.91 });
});

it('maps a facility row to a LocationHub', () => {
  const h = facilityRowToHub({ id: 'd1', name: 'PDRRMO', kind: 'depot', is_depot: true, latitude: 10.31, longitude: 123.89 });
  expect(h).toMatchObject({ id: 'd1', name: 'PDRRMO', type: 'warehouse', latitude: 10.31, longitude: 123.89 });
});
