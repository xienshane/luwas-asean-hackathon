'use client';

import React, { useEffect, useState } from 'react';
import { COLOR } from './tokens';
import { contactState, elapsedHours, formatElapsed } from '@/lib/coordinator/contactState';

// The clock reads to the second, so it has to tick every second to stay honest.
const TICK_MS = 1_000;

/**
 * The wall clock, as an external system this component subscribes to.
 *
 * Reading Date.now() during render would be impure AND wrong: the elapsed time
 * would freeze at first paint, so a chip left on screen would quietly go stale
 * while claiming to be current. Starting at null also keeps server and client
 * markup identical, so no clock appears until the browser has one.
 */
function useNow(pinned?: number): number | null {
  const [now, setNow] = useState<number | null>(pinned ?? null);

  useEffect(() => {
    if (pinned !== undefined) return;
    // Subscribing to an external source (the clock) is the case this rule allows;
    // the write happens in a timer callback, never synchronously during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [pinned]);

  return pinned ?? now;
}

interface SilentWatchChipProps {
  name: string;
  cityMunicipality: string;
  /** True when the barangay is a stop on a COMPLETED route. */
  served: boolean;
  /** Hours since the last CONFIRMED report; null means never contacted. */
  hoursSinceContact: number | null;
  /** ISO timestamp of the last confirmed report — provenance line and clock origin. */
  lastConfirmedContact: string | null;
  /** Earliest report of the operation — the clock origin for never-contacted areas. */
  operationStartedAt: string | null;
  /** Unconfirmed reports for this barangay that the dashboard currently holds. */
  unverifiedReports: number;
  /** Injected for determinism in tests; defaults to a live clock. */
  now?: number;
}

const STATE_STYLE = {
  reached: { label: 'Reached', color: COLOR.active },
  'in-contact': { label: 'In contact', color: COLOR.stable },
  silent: { label: 'Silent', color: COLOR.critical },
} as const;

// Pinned locale + timezone so the rendered clock is identical on the server and in
// the browser — otherwise this reintroduces a hydration mismatch. Cebu = Asia/Manila.
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Manila',
  });

/**
 * The selected community's contact status, pinned to the top-left of the map.
 *
 * Answers one question — has anyone heard from this place — separately from the
 * composite priority tier the choropleth paints. The two genuinely differ: a
 * barangay can rank low priority and still have sent nothing.
 */
export default function SilentWatchChip({
  name,
  cityMunicipality,
  served,
  hoursSinceContact,
  lastConfirmedContact,
  operationStartedAt,
  unverifiedReports,
  now,
}: SilentWatchChipProps) {
  const state = contactState({ served, hoursSinceContact });
  const { label, color } = STATE_STYLE[state];

  const tickedNow = useNow(now);
  const hours =
    tickedNow === null
      ? null
      : elapsedHours({ lastConfirmedContact, operationStartedAt, now: tickedNow });
  const clock = hours === null ? null : formatElapsed(hours);

  // "No report has ever arrived" is false the moment an unverified one has, and
  // that case is the whole argument: reports can be sitting in the queue while the
  // community still counts as silent, because only a CONFIRMED report stops the
  // clock. Say which of the two it is.
  //
  // The count comes from the reports the dashboard holds (its newest-100 window),
  // so it can undercount — never overcount. The fallback line claims nothing about
  // whether anything arrived, so an undercount degrades to a vaguer truth rather
  // than to a false statement.
  const detail =
    state === 'reached'
      ? 'Relief delivered on the ground'
      : lastConfirmedContact
        ? `Last confirmed report ${hhmm(lastConfirmedContact)}`
        : unverifiedReports > 0
          ? `${unverifiedReports} report${unverifiedReports === 1 ? '' : 's'} in — none confirmed yet`
          : 'No confirmed report yet';

  return (
    <div className="w-full bg-surface border border-line rounded-card px-3.5 py-3 select-none">
      <div className="text-[11px] uppercase tracking-wide text-muted truncate">
        {name} <span className="opacity-60">· {cityMunicipality}</span>
      </div>

      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="flex items-center gap-1.5 text-[15px] font-medium" style={{ color }}>
          {state === 'reached' ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke={color}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            // Shape backs up the colour: silence is a hollow ring (nothing there),
            // contact is a filled dot. Never colour alone.
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={
                state === 'silent'
                  ? { border: `2px solid ${color}` }
                  : { background: color }
              }
            />
          )}
          {label}
        </span>
        {clock && (
          <span className="ml-auto font-mono tabular-nums text-[15px]" style={{ color }}>
            {clock}
          </span>
        )}
      </div>

      <div className="mt-1 text-[12px] text-muted leading-snug">{detail}</div>
    </div>
  );
}
