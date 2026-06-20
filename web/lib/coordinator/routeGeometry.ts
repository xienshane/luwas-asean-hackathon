export type LngLat = [number, number];

// Which coordinates to draw for a PERSISTED team route. Prefer route.path — the real-road
// geometry pgRouting produced (dispatch_route / pipeline_save_route). It follows roads AND
// respects blocked edges, because it is rebuilt whenever an edge is closed. An OSRM snap is
// only a fallback for a degenerate path: public OSRM has no knowledge of our road blocks, so
// it must never override a real path or reroutes would render straight through closed roads.
export function routeLineCoords(
  route: { path: { lat: number; lng: number }[] },
  snapped?: LngLat[] | null,
): LngLat[] {
  if (route.path && route.path.length >= 2) return route.path.map((p) => [p.lng, p.lat] as LngLat);
  if (snapped && snapped.length >= 2) return snapped;
  return route.path?.map((p) => [p.lng, p.lat] as LngLat) ?? [];
}
