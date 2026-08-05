const MAX_NAMED = 3;

/**
 * The alert line for stops OR-Tools could not fit into any route. A barangay dropping out
 * of the plan must never be silent — it is the failure mode the whole product exists to
 * prevent — so this always states the full count and what the coordinator can do.
 * Returns null when nothing was dropped.
 */
export function capacityAlert(
  dropped: string[] | undefined | null,
  nameFor: (barangayId: string) => string,
): string | null {
  if (!dropped || dropped.length === 0) return null;
  const names = dropped.slice(0, MAX_NAMED).map(nameFor);
  const overflow = dropped.length - names.length;
  const list = overflow > 0 ? `${names.join(', ')} +${overflow} more` : names.join(', ');
  const noun = dropped.length === 1 ? 'barangay' : 'barangays';
  return `CAPACITY: ${dropped.length} ${noun} not routable this run — ${list}. Add team capacity or dispatch them manually.`;
}
