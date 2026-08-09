import type { LngLat } from "./routeGeometry";

// Pure geometry helpers for the demo convoy marker (Part A). The convoy rides the SAME
// real-road polyline the route line draws (routeLineCoords), so it can never cut across a
// blocked edge. These helpers walk that polyline by cumulative segment length and return a
// point + bearing at a fraction f ∈ [0,1]. No external dependency (no turf) — manual math,
// adequate at Cebu scale with a cos(latitude) longitude correction.

export interface PathLength {
  /** cum[i] = planar length from coords[0] to coords[i]; cum[0] = 0. */
  cum: number[];
  total: number;
}

export interface PointAtFraction {
  lng: number;
  lat: number;
  /** Compass bearing of the active segment, degrees, 0 = North, clockwise. */
  bearing: number;
}

// Planar length with a cos(latitude) longitude correction. Units are arbitrary (degree-ish);
// only RATIOS matter for interpolation, so we never convert to metres.
function segmentLength(a: LngLat, b: LngLat): number {
  const latMid = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(latMid);
  const dy = b[1] - a[1];
  return Math.hypot(dx, dy);
}

export function pathLength(coords: LngLat[]): PathLength {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += segmentLength(coords[i - 1], coords[i]);
    cum.push(total);
  }
  return { cum, total };
}

function bearingOf(a: LngLat, b: LngLat): number {
  const latMid = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(latMid);
  const dy = b[1] - a[1];
  // atan2(dx, dy): 0 = North (+dy), 90 = East (+dx), clockwise.
  const deg = Math.atan2(dx, dy) * (180 / Math.PI);
  return (deg + 360) % 360;
}

export function pointAtFraction(coords: LngLat[], f: number): PointAtFraction {
  if (!coords || coords.length < 2) {
    const p = coords?.[0] ?? [0, 0];
    return { lng: p[0], lat: p[1], bearing: 0 };
  }
  const { cum, total } = pathLength(coords);
  if (total === 0) {
    return { lng: coords[0][0], lat: coords[0][1], bearing: 0 };
  }
  const clamped = Math.min(1, Math.max(0, f));
  const target = clamped * total;

  // Walk segments to find the one containing `target`.
  for (let i = 1; i < coords.length; i++) {
    if (target <= cum[i] || i === coords.length - 1) {
      const segStart = coords[i - 1];
      const segEnd = coords[i];
      const segLen = cum[i] - cum[i - 1];
      const t = segLen === 0 ? 0 : (target - cum[i - 1]) / segLen;
      return {
        lng: segStart[0] + (segEnd[0] - segStart[0]) * t,
        lat: segStart[1] + (segEnd[1] - segStart[1]) * t,
        bearing: bearingOf(segStart, segEnd),
      };
    }
  }
  // Unreachable (loop always returns), but satisfy the type system.
  const last = coords[coords.length - 1];
  return { lng: last[0], lat: last[1], bearing: 0 };
}

// Deterministic per-route stop fraction so concurrent convoys stagger instead of stacking at
// one point. Hash the routeId → base ± spread.
//
// Why base 0.20 and a tight spread: the convoy has to park OUT of the depot but SHORT of the
// first major crossing, because the S08 beat is "the bridge ahead of you is gone". A convoy
// already sitting mid-span has nothing to be rerouted around, and one still inside the hub
// has not departed. On the Cebu pilot route (HQ → Catarman, 14 km) the CCLEX approach starts
// at f≈0.24, so 0.20 ± 0.03 keeps every convoy on the coastal road with the bridge still in
// front of it. Widening the spread past ~0.03 puts an outlier on the span.
export function stopFraction(routeId: string, base = 0.2, spread = 0.03): number {
  let hash = 0;
  for (let i = 0; i < routeId.length; i++) {
    hash = (hash * 31 + routeId.charCodeAt(i)) | 0;
  }
  // Map hash to [0,1), then to [-1,1], then scale by spread.
  const unit = ((hash >>> 0) % 1000) / 1000; // [0,1)
  return base + (unit * 2 - 1) * spread;
}
