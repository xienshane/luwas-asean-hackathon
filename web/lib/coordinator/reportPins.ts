/**
 * How loudly a field report should draw itself on the command map.
 *
 * The map routinely holds ~100 reports at once and the province-wide queue runs
 * into the hundreds. Rendering them as ~100 identical 20px circles separated only
 * by hue put every report at equal weight, which had three consequences: the dozen
 * reports a coordinator can act on were outvoted by the ones already handled; the
 * brand green that means "relief is moving" was spent on ~90 handled reports; and
 * red-vs-green as the only distinction fails for the ~8% of men with a red/green
 * deficiency.
 *
 * Salience follows SEVERITY, not status, because that is how anyone triages a
 * queue this deep — a confirmed report is evidence, not a task, and a routine
 * pending one can wait behind a critical one. Status still shows, through shape and
 * colour, but it does not decide how much attention the mark demands.
 *
 * The quiet tiers matter as much as the loud one: at low weight they read as a
 * field of texture rather than as N objects, and a field has an edge. On this map
 * that edge is the silence — the communities that sent nothing — which is the whole
 * thing the coordinator is looking for.
 */
export type ReportPinTier = 'act' | 'elevated' | 'routine' | 'done';

export interface PinnableReport {
  status: 'pending' | 'confirmed' | 'flagged';
  needsSeverity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
}

export function reportPinTier({ status, needsSeverity }: PinnableReport): ReportPinTier {
  // Flagged means a coordinator judged it unreliable — that is an open decision
  // regardless of the severity the parser assigned, so it stays loud.
  if (status === 'flagged') return 'act';
  // Confirmed is finished work. It stays on the map as evidence of contact, which
  // is what makes the gaps legible, but it never competes for attention.
  if (status === 'confirmed') return 'done';
  if (needsSeverity === 'critical') return 'act';
  if (needsSeverity === 'high') return 'elevated';
  return 'routine';
}

/** True for the tier rendered as an interactive DOM marker rather than a map circle. */
export function isLoudTier(tier: ReportPinTier): boolean {
  return tier === 'act';
}

/**
 * Radius ramp per tier, as [radiusAtZoom10, radiusAtZoom15] for a MapLibre zoom
 * interpolation. Sizes stay small on purpose — these are the quiet tiers, and the
 * ramp keeps their apparent density roughly constant as the map zooms in rather
 * than letting them merge into blobs at low zoom.
 */
export const DOT_RADIUS: Record<Exclude<ReportPinTier, 'act'>, [number, number]> = {
  elevated: [4, 6],
  routine: [3, 5],
  done: [2.5, 4],
};

/**
 * Opacity per tier. 0.6 is the floor, not a taste call: below it, `muted`
 * (#8C93A0) over the basemap (#0B0C0E) drops under the 3:1 contrast minimum WCAG
 * sets for graphical objects, and the dot stops being reliably visible.
 */
export const DOT_OPACITY: Record<Exclude<ReportPinTier, 'act'>, number> = {
  elevated: 0.8,
  routine: 0.75,
  done: 0.6,
};
