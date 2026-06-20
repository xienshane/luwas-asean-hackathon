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
  /** 80% prediction interval, rendered as a thin bar under the value. */
  range?: { low: number; high: number };
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
      {range && (
        <div className="mt-2">
          <div className="h-1 rounded-full bg-line overflow-hidden" aria-hidden>
            <div
              className="h-full rounded-full bg-muted/60"
              style={{ marginLeft: '8%', width: '84%' }}
            />
          </div>
          <p className="mt-1 text-[11px] font-mono tabular-nums text-muted">
            80% interval · {range.low.toLocaleString()}–{range.high.toLocaleString()}
          </p>
        </div>
      )}
      {sub && <div className="mt-1.5 text-[13px] text-muted">{sub}</div>}
    </div>
  );
}
