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

export interface GhostState {
  prevByTeam: Record<string, LngLat[]>;  // last rendered ACTIVE geometry, keyed by stable teamId
  ghostByTeam: Record<string, LngLat[]>; // previous path to render as a ghost, keyed by teamId
}

export const emptyGhostState = (): GhostState => ({ prevByTeam: {}, ghostByTeam: {} });

// Compute the next ghost state from one render. Keyed by teamId — NOT route.id — because a reroute
// deletes the active row and inserts a new one with a different id (dispatch_route), so a route-id
// key can never bridge old -> new. A team's ghost is the path it just LEFT; it lingers until the
// area is reached (completedTeamIds) or the team reroutes again. Transient absence (delete-before-
// insert) does NOT clear the ghost.
export function nextGhostState(
  prev: GhostState,
  activeByTeam: Record<string, LngLat[]>,
  completedTeamIds: string[] = [],
): GhostState {
  const prevByTeam = { ...prev.prevByTeam };
  const ghostByTeam = { ...prev.ghostByTeam };
  for (const [teamId, coords] of Object.entries(activeByTeam)) {
    if (!coords || coords.length < 2) continue;
    const last = prevByTeam[teamId];
    if (last && coordsChanged(last, coords)) ghostByTeam[teamId] = last;
    prevByTeam[teamId] = coords;
  }
  for (const teamId of completedTeamIds) {
    delete ghostByTeam[teamId];
    delete prevByTeam[teamId];
  }
  return { prevByTeam, ghostByTeam };
}
