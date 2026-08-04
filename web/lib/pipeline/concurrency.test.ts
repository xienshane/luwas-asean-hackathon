import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './concurrency';

const tick = () => new Promise<void>((r) => setTimeout(r, 1));

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const out = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('never runs more than `limit` at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
    });
    expect(peak).toBe(4);
  });

  it('handles a limit larger than the input', async () => {
    const out = await mapWithConcurrency([1, 2], 8, async (n) => n * 2);
    expect(out).toEqual([2, 4]);
  });

  it('returns an empty array for empty input without calling fn', async () => {
    let calls = 0;
    const out = await mapWithConcurrency([], 4, async () => { calls += 1; });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it('propagates a rejection from any item', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('build-manifest responded 503');
        return n;
      }),
    ).rejects.toThrow('build-manifest responded 503');
  });
});
