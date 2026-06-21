import { describe, expect, it } from 'vitest';
import { coordsChanged, nextGhostState, emptyGhostState, ghostDivergentSegments } from './ghostRoutes';

const a: [number, number][] = [[123.9, 10.3], [123.91, 10.31]];

const A = [[123.9, 10.3], [123.91, 10.31]] as [number, number][];
const A2 = [[123.9, 10.3], [123.92, 10.31]] as [number, number][]; // rerouted path

describe('nextGhostState (keyed by teamId, survives route-id churn)', () => {
  it('no ghost on a fresh dispatch (nothing to ghost yet)', () => {
    const s = nextGhostState(emptyGhostState(), { t1: A });
    expect(s.ghostByTeam.t1).toBeUndefined();
    expect(s.prevByTeam.t1).toEqual(A);
  });
  it('captures the OLD path when a team reroutes (new route.id, same teamId)', () => {
    const s = nextGhostState(nextGhostState(emptyGhostState(), { t1: A }), { t1: A2 });
    expect(s.ghostByTeam.t1).toEqual(A);
    expect(s.prevByTeam.t1).toEqual(A2);
  });
  it('keeps the ghost through the delete-before-insert render (team momentarily has no active route)', () => {
    let s = nextGhostState(emptyGhostState(), { t1: A });
    s = nextGhostState(s, { t1: A2 });   // ghost = A
    s = nextGhostState(s, {});           // old row deleted, new not yet arrived
    expect(s.ghostByTeam.t1).toEqual(A);
  });
  it('clears the ghost when the area is reached (route completed)', () => {
    let s = nextGhostState(emptyGhostState(), { t1: A });
    s = nextGhostState(s, { t1: A2 });
    s = nextGhostState(s, {}, ['t1']);
    expect(s.ghostByTeam.t1).toBeUndefined();
    expect(s.prevByTeam.t1).toBeUndefined();
  });
  it('does not re-capture on an unchanged re-render (ghost stays the original old path)', () => {
    let s = nextGhostState(emptyGhostState(), { t1: A });
    s = nextGhostState(s, { t1: A2 });   // ghost = A
    s = nextGhostState(s, { t1: A2 });   // unchanged
    expect(s.ghostByTeam.t1).toEqual(A);
  });
});

describe('ghostDivergentSegments (only the parts the new route does not cover)', () => {
  it('returns the whole ghost when there is no active path to compare', () => {
    const ghost = [[0, 0], [1, 1], [2, 2]] as [number, number][];
    expect(ghostDivergentSegments(ghost, [])).toEqual([ghost]);
  });
  it('trims a shared HQ prefix, keeping the divergent tail bridged to the branch point', () => {
    const ghost = [[0, 0], [1, 0], [2, 0], [3, 0]] as [number, number][];
    const active = [[0, 0], [1, 0], [2, 1], [3, 1]] as [number, number][]; // shares [0,0],[1,0]
    // divergent run starts after the last shared vertex [1,0], bridged back to it
    expect(ghostDivergentSegments(ghost, active)).toEqual([[[1, 0], [2, 0], [3, 0]]]);
  });
  it('keeps a divergent MIDDLE bridged to the shared vertex on both sides', () => {
    const ghost = [[0, 0], [1, 0], [2, 0], [5, 0]] as [number, number][];
    const active = [[0, 0], [1, 0], [9, 9], [5, 0]] as [number, number][]; // shares ends, differs middle
    expect(ghostDivergentSegments(ghost, active)).toEqual([[[1, 0], [2, 0], [5, 0]]]);
  });
  it('returns nothing when the paths are identical (no divergence to mark)', () => {
    const p = [[0, 0], [1, 0], [2, 0]] as [number, number][];
    expect(ghostDivergentSegments(p, p)).toEqual([]);
  });
});

describe('coordsChanged', () => {
  it('is false for identical paths', () => {
    expect(coordsChanged(a, [[123.9, 10.3], [123.91, 10.31]])).toBe(false);
  });
  it('is true when a coordinate moves', () => {
    expect(coordsChanged(a, [[123.9, 10.3], [123.92, 10.31]])).toBe(true);
  });
  it('is true when the length differs (a reroute is usually longer/shorter)', () => {
    expect(coordsChanged(a, [[123.9, 10.3], [123.91, 10.31], [123.92, 10.32]])).toBe(true);
  });
  it('is false when the previous path was empty (nothing to ghost)', () => {
    expect(coordsChanged([], a)).toBe(false);
  });
});
