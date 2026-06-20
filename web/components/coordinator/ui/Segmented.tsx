import React, { useRef } from 'react';

export interface SegmentedTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

// Segmented tab control with a STRONG filled active state (bg-raised + 2px accent underline),
// optional count badge, 44px hit height, roving arrow-key focus, and a visible focus ring.
// Replaces the barely-visible `border-b-2 border-fg/50` tab affordance.
export default function Segmented({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: SegmentedTab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  return (
    <div role="tablist" aria-orientation="horizontal" className={`flex gap-1 ${className}`}>
      {tabs.map((tab, idx) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => { refs.current[idx] = el; }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={`relative flex-1 min-h-[44px] px-3 flex items-center justify-center gap-1.5
              text-[13px] font-medium rounded-control cursor-pointer transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40
              ${selected ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}
          >
            {tab.icon && <span aria-hidden className="shrink-0">{tab.icon}</span>}
            <span className="truncate">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                className={`ml-0.5 px-1.5 py-px rounded-full text-[11px] font-mono tabular-nums
                  ${selected ? 'bg-fg/10 text-fg' : 'bg-line text-muted'}`}
              >
                {tab.count}
              </span>
            )}
            {selected && (
              <span aria-hidden className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-active" />
            )}
          </button>
        );
      })}
    </div>
  );
}
