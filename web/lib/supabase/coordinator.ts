import { createClient } from './client';
import type { Barangay, BoundaryGeometry, Team, RoadEdge, LocationHub, Volunteer } from '@/lib/types/coordinator';
import { DEFAULT_REGION, type RegionId } from '@/lib/regions';

// Phase 4.4 composite-priority weights (Σ = 1.0). The score is an additive blend, so the
// tooltip can reconcile it as Σ weightᵢ × componentᵢ.
export interface ScoreWeights {
  pop: number;
  hazard: number;
  vuln: number;
  impact: number;
  silence: number;
  nearby: number;
}

// Composite priority components for one barangay — mirrors what the map tooltip and the
// intelligence panel read. Phase 4.4 widened this from the silence-only product to the
// six-component weighted blend (population, hazard, structural vulnerability, predicted
// impact, silence, nearby confirmed activity).
export interface BarangayScore {
  barangayId: string;
  score: number;
  hoursSinceContact: number | null;
  timeFactor: number;
  popDensityNorm: number;
  hazardNorm: number;
  structuralVulnFrac: number;
  impactFrac: number;
  nearbyNorm: number;
  weights: ScoreWeights;
}

// Default blend weights, mirroring the SQL (silent_area_score, Phase 4.4) for the rare
// case a row predates the migration and has no stored weights.
const DEFAULT_WEIGHTS: ScoreWeights = {
  pop: 0.15, hazard: 0.2, vuln: 0.15, impact: 0.25, silence: 0.15, nearby: 0.1,
};

export interface CoordinatorMapData {
  barangays: Barangay[];
  scores: BarangayScore[];
  /**
   * When this operation began — the earliest report anyone filed. Null if there
   * are none. Used as the clock origin for barangays that have NEVER been
   * contacted, which have no "since last contact" of their own to count from.
   */
  operationStartedAt: string | null;
}

// The response window LUWAS is scoped to. Bounding the lookup is what stops a
// leftover row from an earlier run turning "silent for 14 hours" into "silent for
// three months" — an unbounded min(created_at) would happily reach back forever.
const OPERATION_WINDOW_HOURS = 72;

async function fetchOperationStartedAt(
  supabase: ReturnType<typeof createClient>,
): Promise<string | null> {
  const since = new Date(Date.now() - OPERATION_WINDOW_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from('field_reports')
    .select('created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1);

  // A missing origin degrades one clock to "no timer"; it must not fail the map.
  if (error) {
    console.error('Failed to read the operation start time', error);
    return null;
  }
  return (data?.[0] as { created_at: string } | undefined)?.created_at ?? null;
}

// Province-wide report counters.
//
// These CANNOT be derived from the dashboard's report state: useLiveReports holds
// only the newest 100 rows, so a derived count silently saturates at 100 while the
// real queue runs into the hundreds — the counter would read "100 awaiting" no
// matter how deep the backlog got. Counting server-side keeps the number true and
// costs nothing: head:true sends no rows, only the count.
export interface ReportCounts {
  pending: number;
  pendingCritical: number;
}

export async function fetchReportCounts(
  region: RegionId = DEFAULT_REGION,
): Promise<ReportCounts> {
  const supabase = createClient();
  // Counts read the enriched view, not the base table: `region` lives on barangays, and
  // an unscoped count put Cebu's whole queue above a map of Đà Nẵng.
  //
  // Reports with a null region never geocoded, so they belong to no pack and count in
  // every one — the same rule useLiveReports applies to the feed these numbers head. An
  // unplaced report is precisely the one a coordinator must not lose, and the counter
  // agreeing with the list matters more than avoiding a double count across regions.
  const scope = `region.eq.${region},region.is.null`;
  const [pending, critical] = await Promise.all([
    supabase
      .from('coordinator_field_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .or(scope),
    supabase
      .from('coordinator_field_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('needs_severity', 'critical')
      .or(scope),
  ]);

  if (pending.error) throw pending.error;
  if (critical.error) throw critical.error;

  return { pending: pending.count ?? 0, pendingCritical: critical.count ?? 0 };
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
  structural_vuln_frac: number | null;
  impact_affected: number | null;
  impact_frac: number | null;
  nearby_report_km: number | null;
  nearby_norm: number | null;
  inputs: { weights?: Partial<ScoreWeights> } | null;
}

const COLUMNS =
  'id,name,city_municipality,province,population,latitude,longitude,boundary,' +
  'score,pop_density,pop_density_norm,hazard_composite,hazard_norm,' +
  'hours_since_contact,last_confirmed_contact,time_factor,' +
  'structural_vuln_frac,impact_affected,impact_frac,nearby_report_km,nearby_norm,inputs';

// PostgREST silently caps any un-paginated select at 1,000 rows and the view holds
// ~1,200 barangays, so a single select() drops ~200 of them — and with no order by,
// WHICH ones drop shifts every time the score cron rewrites the table. Page through
// with an explicit order so every barangay reaches the map.
const PAGE_SIZE = 1000;

// Fetch the live Silent Area scores joined to barangay identity + boundary for the
// coordinator map. RLS (via the security_invoker view) returns rows only to a signed-in
// coordinator; a volunteer/anon gets an empty set rather than an error.
export async function fetchCoordinatorMapData(
  region: RegionId = DEFAULT_REGION,
): Promise<CoordinatorMapData> {
  const supabase = createClient();
  // Kicked off before the paging loop so it overlaps it rather than adding a
  // round trip to the critical path.
  const operationStartedAtPromise = fetchOperationStartedAt(supabase);
  const rows: ScoreViewRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('coordinator_barangay_scores')
      .select(COLUMNS)
      .eq('region', region)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const batch = (data ?? []) as unknown as ScoreViewRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

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
    structuralVulnFrac: r.structural_vuln_frac ?? 0,
    impactFrac: r.impact_frac ?? 0,
    nearbyNorm: r.nearby_norm ?? 0,
    weights: { ...DEFAULT_WEIGHTS, ...(r.inputs?.weights ?? {}) },
  }));

  return { barangays, scores, operationStartedAt: await operationStartedAtPromise };
}

// ── Teams ──────────────────────────────────────────────────────────────────
export interface TeamRow {
  id: string; name: string; capacity_kg: number | null; status: string;
  type: string; base_lat: number | null; base_lng: number | null;
}
export function teamRowToUi(r: TeamRow): Team {
  return {
    id: r.id, name: r.name, capacityKg: Number(r.capacity_kg ?? 0),
    status: (['active', 'dispatched', 'maintenance', 'idle'].includes(r.status) ? r.status : 'idle') as Team['status'],
    type: (['truck', '4x4', 'boat', 'ambulance'].includes(r.type) ? r.type : '4x4') as Team['type'],
    baseLocation: { lat: r.base_lat ?? 10.3157, lng: r.base_lng ?? 123.8854 },
  };
}
export async function fetchTeams(region: RegionId = DEFAULT_REGION): Promise<Team[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('coordinator_teams')
    .select('id,name,capacity_kg,status,type,base_lat,base_lng')
    .eq('region', region);
  if (error) throw error;
  return (data ?? []).map((r) => teamRowToUi(r as TeamRow));
}

// ── Road status (impassable edges only) ──────────────────────────────────────
interface RoadStatusRow {
  id: number; name: string | null; length_m: number | null; impassable: boolean;
  geometry: { type: string; coordinates: number[][] } | null;
}
export function roadStatusRowToEdge(r: RoadStatusRow): RoadEdge {
  const coords = r.geometry?.coordinates ?? [];
  const a = coords[0] ?? [0, 0];
  const b = coords[coords.length - 1] ?? a;
  return {
    id: String(r.id), name: r.name ?? `Edge ${r.id}`,
    sourceNode: 'A', targetNode: 'B',
    sourceCoords: { lat: a[1], lng: a[0] }, targetCoords: { lat: b[1], lng: b[0] },
    status: 'blocked', lengthM: Number(r.length_m ?? 0),
    notes: 'Flagged impassable by a field report',
  };
}
export async function fetchRoadStatus(): Promise<RoadEdge[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('coordinator_road_status')
    .select('id,name,length_m,impassable,geometry');
  if (error) throw error;
  return (data ?? []).map((r) => roadStatusRowToEdge(r as RoadStatusRow));
}

// ── Facilities (map hubs) ────────────────────────────────────────────────────
interface FacilityRow {
  id: string; name: string; kind: string; is_depot: boolean;
  latitude: number; longitude: number;
}
export function facilityRowToHub(r: FacilityRow): LocationHub {
  const type: LocationHub['type'] = r.kind === 'shelter' ? 'shelter' : r.kind === 'staging' ? 'supply_hub' : 'warehouse';
  return { id: r.id, name: r.name, type, latitude: r.latitude, longitude: r.longitude, capacityPercent: 0 };
}
export async function fetchFacilities(region: RegionId = DEFAULT_REGION): Promise<LocationHub[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('coordinator_facilities')
    .select('id,name,kind,is_depot,latitude,longitude')
    .eq('region', region);
  if (error) throw error;
  return (data ?? []).map((r) => facilityRowToHub(r as FacilityRow));
}

// ── Volunteer roster (TeamsView crew) ────────────────────────────────────────
export async function fetchVolunteerRoster(): Promise<Volunteer[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('coordinator_volunteers')
    .select('id,full_name,team_id,status,last_location_at');
  if (error) throw error;
  type RosterRow = {
    id: string; full_name: string | null; team_id: string | null;
    status: string | null; last_location_at: string | null;
  };
  return ((data ?? []) as RosterRow[]).map((r) => ({
    id: r.id, name: r.full_name ?? 'Volunteer', phone: '',
    teamId: r.team_id, teamName: null,
    availability: r.status === 'active' ? 'available' : 'offline',
    lastCheckIn: r.last_location_at ?? '—',
    latitude: 0, longitude: 0,
  }));
}
