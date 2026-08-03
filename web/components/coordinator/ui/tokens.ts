// Design tokens mirrored as JS constants for canvas/MapLibre consumers, which
// need hex strings rather than CSS custom properties. Keep these in sync with
// the @theme block in app/globals.css.

export const COLOR = {
  bg: '#0B0C0E',
  surface: '#131418',
  raised: '#1C1E23',
  fg: '#E6E8EB',
  muted: '#8C93A0',
  line: 'rgba(255,255,255,0.08)',
  critical: '#EF5B50',
  warning: '#E0A63D',
  active: '#43AD63',
  reached: '#C7CBD2',
} as const;

// Map linework palette — the map-canvas siblings of COLOR, consumed by
// InteractiveCommandMap for MapLibre paint expressions and the legend. Kept here
// (single source of truth) so the map layers and the legend swatches can't disagree.
// Keep in sync with §1.3 of the UI refresh plan.
export const MAP = {
  ROAD_OPEN: '#4C5563',       // desaturated slate — infrastructure, below routes
  ROUTE_ACTIVE: '#2DD4BF',    // the one vivid accent (teal on graphite)
  ROUTE_PLANNED: '#8590A3',   // muted dashed planned
  ROUTE_DONE: '#41454E',      // dimmed graphite completed
  ROUTE_CASING: '#08090B',    // route casing, tracks the basemap bg
  BARANGAY_OUTLINE: '#343841',// graphite boundary
  HUB: '#41454E',             // hub markers + legend swatch (infrastructure, not a route)
} as const;

export type Tone = 'critical' | 'warning' | 'active' | 'neutral';

// ── Silent Area state: the three pin states from Phase 3.1 ──────────────────
//   reached (neutral/light) · escalating (amber) · critical (red)
// Thresholds calibrated to the Phase 4.4 COMPOSITE priority distribution, which is
// an additive blend (no longer a near-zero-able product). With the always-on
// baseline (silence + province vulnerability), scores cluster ~0.29–0.43 with a
// high tail to ~0.75 driven by predicted impact, so the cut points sit higher and
// tighter than the old multiplicative scale: critical ≈ the predicted-impact tail,
// escalating ≈ the upper-middle, reached ≈ the low-priority lower half.
export type SilentAreaState = 'reached' | 'escalating' | 'critical';

export function silentAreaState(score: number): SilentAreaState {
  if (score >= 0.45) return 'critical';
  if (score >= 0.34) return 'escalating';
  return 'reached';
}

export const STATE_COLOR: Record<SilentAreaState, string> = {
  reached: COLOR.reached,
  escalating: COLOR.warning,
  critical: COLOR.critical,
};

export const STATE_LABEL: Record<SilentAreaState, string> = {
  reached: 'Reached',
  escalating: 'Escalating',
  critical: 'Critical',
};

// ── Served state (orthogonal to the silent-area score) ─────────────────────
// A barangay is "served" once it is the destination of a COMPLETED route — i.e.
// relief was actually delivered there. This is a positive, explicit signal and
// is rendered in the brand green (reused from COLOR.active for token consistency),
// overriding the score-based choropleth color so coordinators can see at a glance
// which communities have been reached on the ground.
export const SERVED_COLOR = COLOR.active;
export const SERVED_LABEL = 'Served';

// Maps the report/needs severity scale onto the calm semantic tones.
export const SEVERITY_TONE: Record<string, Tone> = {
  critical: 'critical',
  high: 'critical',
  medium: 'warning',
  low: 'neutral',
};
