import type { LngLat } from './routeGeometry';

// True when `next` is a genuine reroute of a previously-rendered path (so the old one is worth
// keeping as a ghost). An empty `prev` means there was nothing on screen yet — not a reroute.
export function coordsChanged(prev: LngLat[], next: LngLat[]): boolean {
  if (prev.length === 0) return false;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i][0] !== next[i][0] || prev[i][1] !== next[i][1]) return true;
  }
  return false;
}
