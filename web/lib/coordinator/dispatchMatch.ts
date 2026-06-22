import type { Team, Barangay } from '@/lib/types/coordinator';

// Pure dispatch-match helpers (Part B, Dispatch). They answer "why does this team fit?" —
// est. straight-line distance + capacity-fit — BEFORE a coordinator dispatches. Everything is
// an ESTIMATE (no per-team live routing call; free-tier/honest); the UI labels it "est.".

export type LatLng = { lat: number; lng: number };
export type Fit = 'fits' | 'tight' | 'short';

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

// Great-circle distance in km. Straight-line — an estimate, not the pgRouting road distance.
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estDistanceKm(team: Team, barangay: Pick<Barangay, 'latitude' | 'longitude'>): number {
  return haversineKm(team.baseLocation, { lat: barangay.latitude, lng: barangay.longitude });
}

// Capacity headroom against an estimated cargo weight. fits = full load; tight = within 20%;
// short = cannot carry it in one trip. Unknown/zero weight is treated as fits (no signal).
export function capacityFit(team: Team, manifestWeightKg: number): Fit {
  if (!(manifestWeightKg > 0)) return 'fits';
  const ratio = team.capacityKg / manifestWeightKg;
  if (ratio >= 1) return 'fits';
  if (ratio >= 0.8) return 'tight';
  return 'short';
}

// Nearest dispatchable team that can carry the load. Prefers nearest-that-fits over a nearer
// team that doesn't fit; deterministic tiebreak on id. Returns null if no team fits.
export function recommendTeam(
  teams: Team[],
  barangay: Pick<Barangay, 'latitude' | 'longitude'>,
  manifestWeightKg: number,
): Team | null {
  const candidates = teams
    .filter((t) => (t.status === 'active' || t.status === 'idle') && capacityFit(t, manifestWeightKg) !== 'short')
    .map((t) => ({ t, d: estDistanceKm(t, barangay) }))
    .sort((a, b) => a.d - b.d || a.t.id.localeCompare(b.t.id));
  return candidates[0]?.t ?? null;
}
