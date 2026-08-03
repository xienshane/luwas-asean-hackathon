import React from 'react';
import StatusDot from './StatusDot';
import type { Tone } from './tokens';

export interface TimelineItem {
  id: string;
  time: string; // pre-formatted, e.g. "11:42"
  tone?: Tone;
  label?: string; // optional category/severity word, e.g. "Critical"
  text: string;
}

// Dense, calm chronological feed (Linear / Slack / GitHub activity).
// No cards — time gutter, a single status dot, then the event.
export default function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="text-[13px]">
      {items.map((it) => (
        <li
          key={it.id}
          className="flex gap-3 px-4 py-1 hover:bg-raised/40 transition-colors duration-100"
        >
          <span className="font-mono tabular-nums text-muted shrink-0 w-10 pt-px">
            {it.time}
          </span>
          <span className="pt-1.5">
            <StatusDot tone={it.tone ?? 'neutral'} />
          </span>
          <span className="min-w-0 leading-snug">
            {it.label && <span className="text-fg font-medium mr-1.5">{it.label}</span>}
            <span className="text-muted">{it.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
