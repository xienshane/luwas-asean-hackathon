'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, Search, X } from 'lucide-react';

export interface BarangayOption {
  id: string;
  name: string;
  city_municipality: string | null;
}

// Cap the rendered list — the directory holds ~1,200 barangays and a giant
// native <select> is unusable on a phone. Type-to-filter keeps it convenient.
const MAX_RESULTS = 50;

const control =
  'w-full rounded-control bg-raised border border-line text-base text-fg ' +
  'placeholder:text-muted/50 focus:outline-none focus:border-teal-500 ' +
  'focus:ring-1 focus:ring-teal-500/30 transition-colors';

export default function BarangayPicker({
  options,
  value,
  onChange,
}: {
  options: BarangayOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const src = q
      ? options.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            (o.city_municipality?.toLowerCase().includes(q) ?? false),
        )
      : options;
    return src.slice(0, MAX_RESULTS);
  }, [options, query]);

  // Close when clicking outside the control.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const commit = (o: BarangayOption) => {
    onChange(o.id);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) {
        e.preventDefault();
        commit(filtered[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const displayValue = open ? query : selected?.name ?? '';

  return (
    <div ref={rootRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={displayValue}
        placeholder={selected ? selected.name : 'Search barangay…'}
        onFocus={(e) => {
          setOpen(true);
          e.target.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0); // keep the highlight valid as the result set changes
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={`${control} py-2.5 pl-9 pr-9`}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear barangay"
          onClick={() => {
            onChange('');
            setQuery('');
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      )}

      {open && (
        <ul
          role="listbox"
          id={listId}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-control border border-line bg-surface py-1 shadow-xl shadow-black/40"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-[13px] text-muted">No barangay matches “{query}”.</li>
          )}
          {filtered.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === value}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-[40px] cursor-pointer items-center gap-2 px-3 py-2 text-[14px] transition-colors ${
                i === active ? 'bg-raised' : ''
              }`}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="truncate text-fg">{o.name}</span>
              {o.city_municipality && (
                <span className="ml-auto truncate pl-2 text-[12px] text-muted">
                  {o.city_municipality}
                </span>
              )}
              {o.id === value && <Check className="h-4 w-4 shrink-0 text-active" />}
            </li>
          ))}
          {query.trim() === '' && options.length > MAX_RESULTS && (
            <li className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.1em] text-muted">
              First {MAX_RESULTS} of {options.length} — type to search
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
