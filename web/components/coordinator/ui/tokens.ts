// Design tokens mirrored as JS constants for canvas/MapLibre consumers, which
// need hex strings rather than CSS custom properties. Keep these in sync with
// the @theme block in app/globals.css.

export const COLOR = {
  bg: '#0e1424',
  surface: '#151e31',
  raised: '#1a2438',
  fg: '#e8eef9',
  muted: '#92a0b8',
  line: 'rgba(255,255,255,0.06)',
  critical: '#e2524a',
  warning: '#d9a23a',
  active: '#3fa35b',
  reached: '#c5d0e2',
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
