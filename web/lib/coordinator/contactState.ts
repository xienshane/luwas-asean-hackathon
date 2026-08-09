/**
 * Contact state for one barangay: has anyone actually heard from this community,
 * and has anything actually been delivered to it.
 *
 * This is deliberately NOT the composite priority tier (`silentAreaState` in
 * components/coordinator/ui/tokens.ts). That answers "how urgent is this place",
 * blending hazard, population, vulnerability, predicted impact and silence. This
 * answers "what contact do we have", which is a fact rather than a ranking. A
 * barangay can sit in the lowest priority tier and still have sent nothing.
 */

export type ContactState = 'reached' | 'in-contact' | 'silent';

/**
 * Hours of no confirmed contact after which a barangay counts as silent.
 * Mirrors the operational definition used everywhere else in LUWAS: only a
 * report with status='confirmed' stops the clock (see silent_area_score —
 * `where fr.status = 'confirmed'`), so an unverified SMS never marks a
 * community as contacted.
 */
export const SILENT_AFTER_HOURS = 24;

export interface ContactInput {
  /** True when the barangay is a stop on a COMPLETED route — relief arrived. */
  served: boolean;
  /** Hours since the last CONFIRMED report; null means never contacted. */
  hoursSinceContact: number | null;
}

/**
 * Precedence is reached → in-contact → silent. Delivery is the strongest signal
 * we have and it outranks the clock: a barangay that was served an hour ago is
 * "Reached", not "In contact", even though both are true.
 */
export function contactState({ served, hoursSinceContact }: ContactInput): ContactState {
  if (served) return 'reached';
  if (hoursSinceContact !== null && hoursSinceContact <= SILENT_AFTER_HOURS) return 'in-contact';
  return 'silent';
}

export interface ElapsedInput {
  /** ISO timestamp of the last CONFIRMED report; null means never contacted. */
  lastConfirmedContact: string | null;
  /** Earliest report of the current operation (ISO), or null if there are none. */
  operationStartedAt: string | null;
  /** Injected so the result is testable; pass a ticking clock at the call site. */
  now: number;
}

/**
 * Hours to display on the chip's clock.
 *
 * Deliberately derived from a TIMESTAMP rather than from the view's precomputed
 * `hoursSinceContact`. That figure is a snapshot taken when the scores were last
 * written, so a clock built on it would sit frozen for contacted barangays while
 * never-contacted ones ticked — the same chip advancing or not depending on which
 * community you clicked. Timestamps advance on their own.
 *
 * A never-contacted barangay has no "since last contact" to count from, and those
 * are exactly the communities the product exists to surface — leaving them blank
 * would put the emptiest number on the most important case. They fall back to time
 * since the operation began (the first report anyone filed), which is the honest
 * reading: this is how long the response has run without a word from here.
 *
 * Returns null only when there is genuinely nothing to count from, so callers can
 * render a state with no clock rather than a fabricated zero.
 */
export function elapsedHours({ lastConfirmedContact, operationStartedAt, now }: ElapsedInput): number | null {
  const origin = lastConfirmedContact ?? operationStartedAt;
  if (!origin) return null;

  const originMs = Date.parse(origin);
  if (Number.isNaN(originMs)) return null;

  return Math.max(0, (now - originMs) / 3_600_000);
}

/**
 * Hours as `H:MM:SS`, matching the pitch HUD's `H+` clock and running live.
 * Hours are not padded — elapsed time is open-ended and a leading zero would
 * imply a two-digit field. Seconds are floored, not rounded: a stopwatch counts
 * time that has passed, and rounding up would show a second that has not.
 */
export function formatElapsed(hours: number): string {
  const totalSeconds = Math.max(0, Math.floor(hours * 3600));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
