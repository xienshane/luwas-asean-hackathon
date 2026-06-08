import React from 'react';
import type { Tone } from './tokens';

const TONE_BG: Record<Tone, string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  active: 'bg-active',
  neutral: 'bg-muted',
};

// A single calm status dot — replaces the stacked, glowing pills/badges.
export default function StatusDot({
  tone = 'neutral',
  className = '',
}: {
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${TONE_BG[tone]} ${className}`}
    />
  );
}
