import React from 'react';

// Inline status chip — the existing confidence / Day-0 / override / en-route / sim badges
// collapse onto this one primitive. Tone drives a left dot + tinted text (color-not-only:
// the dot is shape+color, never color alone).
export type ChipTone = 'active' | 'warning' | 'critical' | 'muted';

const TONE: Record<ChipTone, { dot: string; text: string; ring: string }> = {
  active: { dot: 'bg-active', text: 'text-active', ring: 'ring-active/30' },
  warning: { dot: 'bg-warning', text: 'text-warning', ring: 'ring-warning/30' },
  critical: { dot: 'bg-critical', text: 'text-critical', ring: 'ring-critical/30' },
  muted: { dot: 'bg-muted', text: 'text-muted', ring: 'ring-line' },
};

export default function Chip({
  tone = 'muted',
  icon,
  children,
  className = '',
}: {
  tone?: ChipTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-px rounded-control text-[12px] font-medium
        bg-raised ring-1 ${t.ring} ${t.text} ${className}`}
    >
      {icon ? (
        <span aria-hidden className="shrink-0">{icon}</span>
      ) : (
        <span aria-hidden className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
      )}
      {children}
    </span>
  );
}
