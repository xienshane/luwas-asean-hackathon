import { describe, expect, it } from 'vitest';
import { coordsChanged, nextGhostState, emptyGhostState } from './ghostRoutes';

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
