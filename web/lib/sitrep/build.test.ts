import { describe, it, expect } from 'vitest';
import { buildSitRep, type SitRepInput } from './build';

const base: SitRepInput = {
  generatedAt: '2026-08-05T02:00:00.000Z',
  operationStart: '2026-08-04T22:00:00.000Z',
  scores: [
    { id: 'b1', name: 'Guadalupe', city_municipality: 'Cebu City', score: 0.71, hours_since_contact: 3 },
    { id: 'b2', name: 'Tisa', city_municipality: 'Cebu City', score: 0.64, hours_since_contact: null },
  ],
  predictions: [
    { barangay_id: 'b1', predicted_affected: 7500, reported_affected: 1234, override_value: null, damage_severity: 'high' },
    { barangay_id: 'b2', predicted_affected: 4200, reported_affected: null, override_value: null, damage_severity: 'moderate' },
  ],
  manifests: [
    { barangay_id: 'b1', days: 3, water_l: 55530, food_packs: 1234, shelter_kits: 300, blankets: 600, breakdown: { total_weight_kg: 58000 }, status: 'approved' },
    { barangay_id: 'b2', days: 3, water_l: 18900, food_packs: 420, shelter_kits: 100, blankets: 200, breakdown: { total_weight_kg: 20000 }, status: 'pending' },
  ],
  routes: [
    { id: 'r1', status: 'completed', team_id: 't1', stops: [{ barangayId: 'b1', barangayName: 'Guadalupe' }], created_at: '2026-08-04T23:00:00.000Z' },
  ],
  teamNames: { t1: 'Alpha Convoy' },
  silent: [{ id: 'b9', name: 'Sirao', hours_since_contact: null }],
  silentCount: 37,
};

describe('buildSitRep', () => {
  it('ranks a confirmed report above the model prediction and labels the source', () => {
    const area = buildSitRep(base).areas.find((a) => a.barangayId === 'b1')!;
    expect(area.affected).toBe(1234);
    expect(area.affectedSource).toBe('reported');
  });

  it('falls back to the prediction and labels it', () => {
    const area = buildSitRep(base).areas.find((a) => a.barangayId === 'b2')!;
    expect(area.affected).toBe(4200);
    expect(area.affectedSource).toBe('predicted');
  });

  it('lets a coordinator override outrank both', () => {
    const input = {
      ...base,
      predictions: base.predictions.map((p) => (p.barangay_id === 'b1' ? { ...p, override_value: 900 } : p)),
    };
    const area = buildSitRep(input).areas.find((a) => a.barangayId === 'b1')!;
    expect(area.affected).toBe(900);
    expect(area.affectedSource).toBe('override');
  });

  it('resolves route status from the stops and prefers the furthest-along route', () => {
    const input = {
      ...base,
      routes: [
        { id: 'r0', status: 'planned' as const, team_id: 't1', stops: [{ barangayId: 'b1' }], created_at: '2026-08-04T22:30:00.000Z' },
        ...base.routes,
      ],
    };
    const areas = buildSitRep(input).areas;
    expect(areas.find((a) => a.barangayId === 'b1')!.routeStatus).toBe('delivered');
    expect(areas.find((a) => a.barangayId === 'b2')!.routeStatus).toBe('unrouted');
  });

  it('reports a manifest with no route stop as a gap', () => {
    const gaps = buildSitRep(base).gaps;
    expect(gaps.unrouted).toEqual([
      { barangayId: 'b2', name: 'Tisa', reason: 'manifest built, no route stop — team capacity or a solver drop' },
    ]);
    expect(gaps.silent).toEqual([{ barangayId: 'b9', name: 'Sirao', hoursSinceContact: null }]);
    expect(gaps.silentCount).toBe(37);
  });

  it('lists deliveries with the team and the areas it reached', () => {
    expect(buildSitRep(base).deliveries).toEqual([
      { routeId: 'r1', team: 'Alpha Convoy', areas: ['Guadalupe'], completedAt: '2026-08-04T23:00:00.000Z' },
    ]);
  });

  it('totals the operation', () => {
    const s = buildSitRep(base).summary;
    expect(s.areasInOperation).toBe(2);
    expect(s.peopleAffected).toBe(1234 + 4200);
    expect(s.areasDelivered).toBe(1);
    expect(s.totalCargoKg).toBe(78000);
    expect(s.unroutedAreas).toBe(1);
    expect(s.silentOver24h).toBe(37);
  });

  it('sorts areas by priority score, highest first', () => {
    expect(buildSitRep(base).areas.map((a) => a.barangayId)).toEqual(['b1', 'b2']);
  });
});
