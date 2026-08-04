/**
 * Serializes an async task. While a run is in flight, further triggers do not start a
 * second run — they collapse into exactly one re-run carrying the newest argument.
 * The pipeline rewrites `routes` wholesale, so overlapping runs are what make routes
 * flicker; one trailing re-run still reflects the latest state.
 */
export function createSerialRunner<T>(task: (arg: T) => Promise<void>): (arg: T) => Promise<void> {
  let running = false;
  let queued: { arg: T } | null = null;

  return async function trigger(arg: T): Promise<void> {
    if (running) {
      queued = { arg };
      return;
    }
    running = true;
    try {
      let next: { arg: T } | null = { arg };
      while (next) {
        const current = next.arg;
        queued = null;
        await task(current);
        next = queued;
      }
    } finally {
      running = false;
      queued = null;
    }
  };
}
