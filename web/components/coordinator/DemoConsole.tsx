'use client';

import { useEffect, useState } from 'react';
import { DEMO_PRESETS, type DemoPreset } from '@/lib/demo/presets';

// Rail order is the file's order: 1 = Bisaya, 2 = Vietnamese.
const KEY_TO_PRESET: Record<string, DemoPreset | undefined> = {
  '1': DEMO_PRESETS[0],
  '2': DEMO_PRESETS[1],
};

/**
 * Stage-only input path. `~` arms for 10s, then `1`/`2` fire a preset through the real
 * SMS intake. Nothing on stage is typed; nothing here exists unless the env flag is set.
 */
export default function DemoConsole({ onLog }: { onLog: (event: string, type: 'info' | 'warn' | 'success' | 'alert') => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 10_000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

      if (e.key === '`' || e.key === '~') { setArmed((a) => !a); return; }
      if (e.key === 'Escape') { setArmed(false); return; }
      if (!armed || busy) return;

      const preset = KEY_TO_PRESET[e.key];
      if (!preset) return;
      e.preventDefault();
      setArmed(false);
      setBusy(true);
      void (async () => {
        try {
          const res = await fetch('/api/demo/preset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preset: preset.id }),
          });
          const out = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(out?.error ?? `preset ${res.status}`);
          onLog(`SMS INTAKE: ${preset.language} received (${out.status ?? 'pending'}).`, 'success');
        } catch (err) {
          onLog(`SMS INTAKE: preset failed — ${err instanceof Error ? err.message : 'unreachable'}.`, 'alert');
        } finally {
          setBusy(false);
        }
      })();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [armed, busy, onLog]);

  if (!armed && !busy) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-control border border-line-strong bg-surface px-3 py-2 text-[12px] font-mono text-muted shadow-overlay"
    >
      {busy ? 'Firing preset…' : '1 Bisaya · 2 Vietnamese · Esc cancel'}
    </div>
  );
}
