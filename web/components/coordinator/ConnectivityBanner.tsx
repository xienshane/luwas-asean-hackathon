'use client';

import { CloudOff, WifiOff } from 'lucide-react';
import type { ConnectivityTier } from '@/lib/live/connectivity';

// Operating-picture degradation indicator (Phase 6.1). Renders nothing when fully
// online; otherwise a fixed top-center pill stating the tier and what still works.
// The cached map + queued/SMS pins keep showing regardless — this only labels that
// live updates are paused (intermittent) or that dispatch needs a reconnect (offline).
const TIER_UI: Record<Exclude<ConnectivityTier, 'online'>, {
  Icon: typeof WifiOff;
  label: string;
  note: string;
  cls: string;
}> = {
  intermittent: {
    Icon: WifiOff,
    label: 'Intermittent connection',
    note: 'Showing the cached operating picture. Live updates are paused; queued reports and SMS pins still appear. Actions retry on reconnect.',
    cls: 'border-warning/40 bg-warning/15 text-warning',
  },
  offline: {
    Icon: CloudOff,
    label: 'Offline',
    note: 'No connection. The last known map stays visible, but dispatch and AI actions are paused until you reconnect.',
    cls: 'border-critical/40 bg-critical/15 text-critical',
  },
};

export default function ConnectivityBanner({ tier }: { tier: ConnectivityTier }) {
  if (tier === 'online') return null;
  const { Icon, label, note, cls } = TIER_UI[tier];
  return (
    <div
      role="status"
      className={`pointer-events-none fixed left-1/2 top-3 z-50 flex max-w-[min(92vw,560px)] -translate-x-1/2 items-start gap-2 rounded-card border px-3.5 py-2 shadow-lg backdrop-blur-sm ${cls}`}
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em]">{label}</p>
        <p className="text-[12px] leading-snug opacity-90">{note}</p>
      </div>
    </div>
  );
}
