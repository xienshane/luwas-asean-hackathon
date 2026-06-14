// Client-side GPS publish throttle (DevPlan 3.4 "throttle client updates sensibly"):
// at most one update per 5s, and only when moved ≥15m — with a 60s heartbeat so
// a stationary volunteer still reads as fresh on the coordinator map.
export interface Fix {
  lat: number;
  lng: number;
  /** epoch ms */
  t: number;
}

const MIN_INTERVAL_MS = 5_000;
const MIN_DISTANCE_M = 15;
const HEARTBEAT_MS = 60_000;

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function shouldPublish(prev: Fix | null, next: Fix): boolean {
  if (!prev) return true;
  const elapsed = next.t - prev.t;
  if (elapsed < MIN_INTERVAL_MS) return false;
  if (distanceMeters(prev.lat, prev.lng, next.lat, next.lng) >= MIN_DISTANCE_M) return true;
  return elapsed >= HEARTBEAT_MS;
}
