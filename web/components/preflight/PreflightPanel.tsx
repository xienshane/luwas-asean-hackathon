'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Check } from '@/lib/preflight/checks';

// Realtime is a browser-to-Supabase socket, so the server route cannot test it. This row is
// measured here, in the same browser that will run the demo.
const REALTIME_TIMEOUT_MS = 5_000;

function useRealtimeCheck(): Check {
  const [row, setRow] = useState<Check>({
    id: 'realtime', label: 'Realtime channel', state: 'fail', detail: 'connecting…',
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('preflight-probe');
    const timer = window.setTimeout(() => setRow((r) => ({
      ...r, state: 'fail',
      detail: 'no SUBSCRIBED within 5s — check the project is not paused and the anon key is current',
    })), REALTIME_TIMEOUT_MS);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(timer);
        setRow({ id: 'realtime', label: 'Realtime channel', state: 'pass', detail: 'channel subscribed' });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        window.clearTimeout(timer);
        setRow({ id: 'realtime', label: 'Realtime channel', state: 'fail', detail: `socket reported ${status}` });
      }
    });

    return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); };
  }, []);

  return row;
}

export default function PreflightPanel() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Starts true: the first run is kicked off on mount, so the button is busy from frame one.
  const [running, setRunning] = useState(true);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const realtime = useRealtimeCheck();

  // Deliberately sets no state before its first await: the mount effect calls this, and a
  // synchronous setState there would cascade a second render before the fetch even starts.
  // The busy/cleared-error state for a manual re-run is set by the button handler instead.
  const run = useCallback(async () => {
    try {
      const res = await fetch('/api/preflight', { cache: 'no-store' });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error ?? `preflight ${res.status}`);
      setChecks(out.checks as Check[]);
      setRanAt(new Date(out.generatedAt).toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'preflight unreachable');
    } finally {
      setRunning(false);
    }
  }, []);

  // Kicked off a tick after mount so the first paint is the placeholder list, not a render
  // cascade from the fetch's state updates.
  useEffect(() => {
    const t = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(t);
  }, [run]);

  const rows = checks ? [...checks, realtime] : null;
  const failed = rows?.filter((c) => c.state === 'fail') ?? [];
  // Ten placeholder rows while the first run is in flight: the list keeps its height, so
  // nothing below it jumps when the results land.
  const display: (Check | null)[] = rows ?? Array.from({ length: 10 }, () => null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 p-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-fg">Stage preflight</h1>
          <p className="text-[13px] text-muted">
            {ranAt ? `Last run ${ranAt}` : 'Checking every stage dependency…'}
          </p>
        </div>
        <button
          onClick={() => { setRunning(true); setError(null); void run(); }}
          disabled={running}
          className="rounded-control border border-line-strong px-3 py-1.5 text-[12px] text-fg transition-colors duration-150 hover:bg-raised disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40"
        >
          {running ? 'Running…' : 'Re-run'}
        </button>
      </header>

      {error && (
        <p className="rounded-control border border-critical/40 bg-critical/10 px-3 py-2 text-[13px] text-critical">
          Preflight could not run — {error}. Check you are signed in as a coordinator and the
          dev server is up, then Re-run.
        </p>
      )}

      {rows && (
        <p
          className={`rounded-control px-3 py-2 text-[13px] ${
            failed.length === 0
              ? 'border border-active/40 bg-active/10 text-active'
              : 'border border-critical/40 bg-critical/10 text-critical'
          }`}
        >
          {failed.length === 0
            ? 'All checks green — clear to open the dashboard.'
            : `${failed.length} check${failed.length === 1 ? '' : 's'} failing: ${failed.map((c) => c.label).join(', ')}.`}
        </p>
      )}

      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {display.map((c, i) => (
          <li key={c?.id ?? i} className="flex items-start gap-3 px-4 py-3">
            <span
              aria-hidden
              className={`mt-1.5 size-2 shrink-0 rounded-full ${
                !c ? 'bg-muted/40' : c.state === 'pass' ? 'bg-active' : 'bg-critical'
              }`}
            />
            <div className="min-w-0">
              <p className="text-[13px] text-fg">{c?.label ?? 'Checking…'}</p>
              <p className="text-[12px] text-muted">{c?.detail ?? ''}</p>
            </div>
            <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">
              {c ? (c.state === 'pass' ? 'pass' : 'fail') : ''}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
