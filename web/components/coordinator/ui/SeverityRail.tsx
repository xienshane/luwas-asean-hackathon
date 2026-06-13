import React from 'react';
import type { Tone } from './tokens';

const TONE_BG: Record<Tone, string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  active: 'bg-active',
  neutral: 'bg-line',
};

// A 2px left rail used to indicate severity on a row instead of a colored pill.
// Render inside a `relative` row.
export default function SeverityRail({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden
      className={`absolute left-0 top-0 bottom-0 w-0.5 ${TONE_BG[tone]}`}
    />
  );
}
