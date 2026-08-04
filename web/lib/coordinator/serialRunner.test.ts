import { describe, it, expect } from 'vitest';
import { createSerialRunner } from './serialRunner';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('createSerialRunner', () => {
  it('runs a lone trigger once', async () => {
    const args: string[] = [];
    const run = createSerialRunner(async (a: string) => { args.push(a); });
    await run('a');
    expect(args).toEqual(['a']);
  });

  it('collapses triggers made during a run into exactly one re-run', async () => {
    const args: string[] = [];
    const gate = deferred();
    const run = createSerialRunner(async (a: string) => {
      args.push(a);
      if (args.length === 1) await gate.promise;
    });

    const first = run('a');
    void run('b');
    void run('c');
    void run('d');
    gate.resolve();
    await first;

    expect(args).toEqual(['a', 'd']); // one re-run, carrying the newest argument
  });

  it('accepts new triggers after the queue drains', async () => {
    const args: string[] = [];
    const run = createSerialRunner(async (a: string) => { args.push(a); });
    await run('a');
    await run('b');
    expect(args).toEqual(['a', 'b']);
  });

  it('unblocks the runner when the task throws', async () => {
    let calls = 0;
    const run = createSerialRunner(async () => { calls += 1; throw new Error('boom'); });
    await expect(run(undefined)).rejects.toThrow('boom');
    await expect(run(undefined)).rejects.toThrow('boom');
    expect(calls).toBe(2);
  });
});
