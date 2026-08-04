import { pickAffected, affectedSource } from '@/lib/pipeline/affected';
import { manifestDemandKg, type ManifestQuantities } from '@/lib/pipeline/manifestDemand';

// Shapes one operation into the fields an ADINet situation update carries: where, how many
// affected and on whose authority, what was planned, what was delivered, and what is still
// unmet. "Shaped for" — nothing is transmitted anywhere.
//
// Pure: the route gathers rows, this decides what they mean.

export interface ScoreRow {
  id: string; name: string; city_municipality: string | null;
  score: number | null; hours_since_contact: number | null;
}
export interface PredictionRow {
  barangay_id: string; predicted_affected: number | null; reported_affected: number | null;
  override_value: number | null; damage_severity: string | null;
}
export interface ManifestRow extends ManifestQuantities {
  barangay_id: string; days: number; status: string;
}
export interface RouteRow {
  id: string; status: 'planned' | 'active' | 'completed'; team_id: string | null;
  stops: { barangayId?: string; barangayName?: string }[] | null; created_at: string;
}

export interface SitRepInput {
  generatedAt: string;
  operationStart: string | null;
  scores: ScoreRow[];
  predictions: PredictionRow[];
  manifests: ManifestRow[];
  routes: RouteRow[];
  teamNames: Record<string, string>;
  /** Longest-silent barangays, for the gaps section. */
  silent: { id: string; name: string; hours_since_contact: number | null }[];
  /** Full count past the threshold, not just the listed sample. */
  silentCount: number;
}

export type RouteStatus = 'delivered' | 'en route' | 'planned' | 'unrouted';

export interface SitRepArea {
  barangayId: string; name: string; city: string | null;
  priorityScore: number | null;
  affected: number | null;
  affectedSource: 'override' | 'reported' | 'predicted' | 'none';
  damageSeverity: string | null;
  hoursSinceContact: number | null;
  manifest: {
    days: number; waterL: number; foodPacks: number; shelterKits: number; blankets: number;
    cargoKg: number; review: string;
  } | null;
  routeStatus: RouteStatus;
}

export interface SitRep {
  generatedAt: string;
  window: { from: string | null; to: string };
  summary: {
    areasInOperation: number; peopleAffected: number; areasDelivered: number;
    totalCargoKg: number; unroutedAreas: number; silentOver24h: number;
  };
  areas: SitRepArea[];
  deliveries: { routeId: string; team: string; areas: string[]; completedAt: string }[];
  gaps: {
    unrouted: { barangayId: string; name: string; reason: string }[];
    silent: { barangayId: string; name: string; hoursSinceContact: number | null }[];
    silentCount: number;
  };
}

const RANK: Record<RouteStatus, number> = { unrouted: 0, planned: 1, 'en route': 2, delivered: 3 };
const FROM_ROUTE: Record<RouteRow['status'], RouteStatus> = {
  planned: 'planned', active: 'en route', completed: 'delivered',
};

export function buildSitRep(input: SitRepInput): SitRep {
  const scoreById = new Map(input.scores.map((s) => [s.id, s]));
  const manifestById = new Map(input.manifests.map((m) => [m.barangay_id, m]));

  // A barangay can appear on several routes across a run; report the furthest-along one.
  const statusById = new Map<string, RouteStatus>();
  for (const r of input.routes) {
    for (const stop of r.stops ?? []) {
      if (!stop.barangayId) continue;
      const next = FROM_ROUTE[r.status];
      const current = statusById.get(stop.barangayId) ?? 'unrouted';
      if (RANK[next] > RANK[current]) statusById.set(stop.barangayId, next);
    }
  }

  const areas: SitRepArea[] = input.predictions.map((p) => {
    const score = scoreById.get(p.barangay_id);
    const m = manifestById.get(p.barangay_id);
    const inputs = {
      override: p.override_value, reported: p.reported_affected, predicted: p.predicted_affected,
    };
    return {
      barangayId: p.barangay_id,
      name: score?.name ?? p.barangay_id,
      city: score?.city_municipality ?? null,
      priorityScore: score?.score ?? null,
      affected: pickAffected(inputs),
      affectedSource: affectedSource(inputs),
      damageSeverity: p.damage_severity,
      hoursSinceContact: score?.hours_since_contact ?? null,
      manifest: m
        ? {
            days: m.days,
            waterL: Number(m.water_l ?? 0),
            foodPacks: Number(m.food_packs ?? 0),
            shelterKits: Number(m.shelter_kits ?? 0),
            blankets: Number(m.blankets ?? 0),
            cargoKg: manifestDemandKg(m),
            review: m.status,
          }
        : null,
      routeStatus: statusById.get(p.barangay_id) ?? 'unrouted',
    };
  });

  areas.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

  const deliveries = input.routes
    .filter((r) => r.status === 'completed')
    .map((r) => ({
      routeId: r.id,
      team: (r.team_id && input.teamNames[r.team_id]) || 'Unassigned team',
      areas: (r.stops ?? []).map((s) => s.barangayName ?? s.barangayId ?? '—'),
      completedAt: r.created_at,
    }));

  // A planned barangay that no route reaches is the failure this product exists to prevent.
  // It goes in the report whether or not anyone asks for it.
  const unrouted = areas
    .filter((a) => a.manifest && a.routeStatus === 'unrouted')
    .map((a) => ({
      barangayId: a.barangayId,
      name: a.name,
      reason: 'manifest built, no route stop — team capacity or a solver drop',
    }));

  return {
    generatedAt: input.generatedAt,
    window: { from: input.operationStart, to: input.generatedAt },
    summary: {
      areasInOperation: areas.length,
      peopleAffected: areas.reduce((n, a) => n + (a.affected ?? 0), 0),
      areasDelivered: areas.filter((a) => a.routeStatus === 'delivered').length,
      totalCargoKg: areas.reduce((n, a) => n + (a.manifest?.cargoKg ?? 0), 0),
      unroutedAreas: unrouted.length,
      silentOver24h: input.silentCount,
    },
    areas,
    deliveries,
    gaps: {
      unrouted,
      silent: input.silent.map((s) => ({
        barangayId: s.id, name: s.name, hoursSinceContact: s.hours_since_contact,
      })),
      silentCount: input.silentCount,
    },
  };
}
