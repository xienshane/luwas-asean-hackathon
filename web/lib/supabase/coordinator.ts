import { createClient } from './client';
import type { Barangay, BoundaryGeometry } from '@/lib/types/coordinator';

// Silent Area score components for one barangay — mirrors what the map tooltip and the
// intelligence panel read. Matches the shape CommandDashboard previously computed locally.
export interface BarangayScore {
  barangayId: string;
  score: number;
  hoursSinceContact: number | null;
  timeFactor: number;
  popDensityNorm: number;
  hazardNorm: number;
}

export interface CoordinatorMapData {
  barangays: Barangay[];
  scores: BarangayScore[];
}

// One row of the public.coordinator_barangay_scores view (Phase 3.1 read model).
interface ScoreViewRow {
  id: string;
  name: string;
  city_municipality: string | null;
  province: string | null;
  population: number | null;
  latitude: number | null;
  longitude: number | null;
  boundary: BoundaryGeometry | null;
  score: number | null;
  pop_density: number | null;
  pop_density_norm: number | null;
  hazard_composite: number | null;
  hazard_norm: number | null;
  hours_since_contact: number | null;
  last_confirmed_contact: string | null;
  time_factor: number | null;
}

const COLUMNS =
  'id,name,city_municipality,province,population,latitude,longitude,boundary,' +
  'score,pop_density,pop_density_norm,hazard_composite,hazard_norm,' +
  'hours_since_contact,last_confirmed_contact,time_factor';

// Fetch the live Silent Area scores joined to barangay identity + boundary for the
// coordinator map. RLS (via the security_invoker view) returns rows only to a signed-in
// coordinator; a volunteer/anon gets an empty set rather than an error.
export async function fetchCoordinatorMapData(): Promise<CoordinatorMapData> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('coordinator_barangay_scores')
    .select(COLUMNS);

  if (error) throw error;
  const rows = (data ?? []) as unknown as ScoreViewRow[];

  const barangays: Barangay[] = rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      cityMunicipality: r.city_municipality ?? '',
      population: r.population ?? 0,
      popDensity: r.pop_density ?? 0,
      hazardComposite: r.hazard_composite ?? 0,
      lastConfirmedContact: r.last_confirmed_contact,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      boundary: r.boundary ?? undefined,
    }));

  const scores: BarangayScore[] = rows.map((r) => ({
    barangayId: r.id,
    score: r.score ?? 0,
    hoursSinceContact: r.hours_since_contact,
    timeFactor: r.time_factor ?? 1,
    popDensityNorm: r.pop_density_norm ?? 0,
    hazardNorm: r.hazard_norm ?? 0,
  }));

  return { barangays, scores };
}
