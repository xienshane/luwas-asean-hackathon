import React from 'react';

// Coverage meter — recommended-vs-on-hand, so "are we short, and by how much?" is readable at
// a glance instead of requiring mental math over two plain figures. Fill is green when met,
// amber when partial, red when critically short; a red "short N" badge marks any shortfall.
// color-not-only: the right-aligned figures + badge carry the same meaning as the bar color.
export default function CoverageBar({
  label,
  recommended,
  onHand,
  unit,
  className = '',
}: {
  label: string;
  recommended: number;
  onHand: number;
  unit: string;
  className?: string;
}) {
  const met = onHand >= recommended;
  const ratio = recommended > 0 ? onHand / recommended : 1;
  const coverage = Math.min(1, Math.max(0, ratio));
  const shortfall = Math.max(0, recommended - onHand);

  const fill = met ? 'bg-active' : coverage >= 0.5 ? 'bg-warning' : 'bg-critical';
  const track = met ? 'bg-line' : 'bg-critical/15';

  const pct = Math.round(coverage * 100);
  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <div
      className={className}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${fmt(onHand)} of ${fmt(recommended)} ${unit} on hand (${pct}%)${shortfall > 0 ? `, short ${fmt(shortfall)} ${unit}` : ''}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[13px] text-fg">{label}</span>
        <span className="flex items-center gap-2">
          {shortfall > 0 && (
            <span className="px-1.5 py-px rounded-control bg-critical/15 text-critical text-[11px] font-medium tabular-nums">
              short {fmt(shortfall)}
            </span>
          )}
          <span className="text-[12px] font-mono tabular-nums text-muted">
            {fmt(onHand)} / {fmt(recommended)} {unit}
          </span>
        </span>
      </div>
      <div className={`h-1 overflow-hidden ${track}`} aria-hidden>
        <div className={`h-full ${fill} transition-[width] duration-300`} style={{ width: `${coverage * 100}%` }} />
      </div>
    </div>
  );
}
