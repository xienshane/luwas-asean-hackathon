import { describe, expect, it } from 'vitest';
import { toggleEdge } from './roadSelection';

describe('toggleEdge', () => {
  it('adds an id that is not selected', () => { expect(toggleEdge([1, 2], 3)).toEqual([1, 2, 3]); });
  it('removes an id that is already selected', () => { expect(toggleEdge([1, 2, 3], 2)).toEqual([1, 3]); });
  it('treats the list immutably (returns a new array)', () => {
    const a = [1, 2]; expect(toggleEdge(a, 3)).not.toBe(a); expect(a).toEqual([1, 2]);
  });
});
