/**
 * Barangays with no confirmed contact for longer than `hours`. A null
 * `hoursSinceContact` means never contacted: maximum silence, so it counts.
 * Mirrors: select count(*) from public.coordinator_barangay_scores
 *          where hours_since_contact is null or hours_since_contact > 24;
 */
export function countSilentOver(
  scores: { hoursSinceContact: number | null }[],
  hours: number,
): number {
  return scores.filter((s) => s.hoursSinceContact == null || s.hoursSinceContact > hours).length;
}
