/**
 * Maps `items` through `fn` with at most `limit` calls in flight, preserving input order.
 *
 * The manifest stage is one HTTP round-trip per barangay wrapping a deterministic formula,
 * so a sequential loop pays 50x the latency of the work itself. Bounded rather than
 * unbounded: a free-tier Space should never see 50 simultaneous sockets from one run.
 * A rejection propagates — a half-built manifest set must not upsert as if it were whole.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i], i);
    }
  };

  const workers = Math.max(0, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
