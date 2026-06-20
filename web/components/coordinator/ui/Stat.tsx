import React from 'react';

// Hero metric — the decision-driving number, large and tabular, with a label, optional accent
// color, sub-line, and an optional 80%-interval range bar (visual, not a buried text line).
export default function Stat({
  label,
  value,
  unit,
  accent,
  sub,
  range,
  action,
  className = '',
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  /** CSS color for the value (e.g. STATE_COLOR[state]); defaults to fg. */
  accent?: string;
  sub?: React.ReactNode;
  /** 80% prediction interval, rendered as a band with the point estimate marked. */
  range?: { low: number; high: number; value?: number };
  /** Right-aligned element beside the value (e.g. a severity badge). */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] uppercase tracking-wider text-muted">{label}</p>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-mono tabular-nums leading-none" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
        {unit && <span className="text-[13px] text-muted">{unit}</span>}
      </div>
      {range && range.high > range.low && (
        <div className="mt-2">
          <div className="relative h-1.5 rounded-full bg-line" aria-hidden>
            <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-muted/30" />
            {typeof range.value === 'number' && (
              <span
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-bg"
                style={{
                  left: `${Math.min(100, Math.max(0, ((range.value - range.low) / (range.high - range.low)) * 100))}%`,
                  background: accent ?? 'var(--color-fg)',
                }}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-mono tabular-nums text-muted">
            <span>{range.low.toLocaleString()}</span>
            <span className="uppercase tracking-wide font-sans text-[10px]">80% interval</span>
            <span>{range.high.toLocaleString()}</span>
          </div>
        </div>
      )}
      {sub && <div className="mt-1.5 text-[13px] text-muted">{sub}</div>}
    </div>
  );
}
