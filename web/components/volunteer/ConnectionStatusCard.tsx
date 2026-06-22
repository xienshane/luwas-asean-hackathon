'use client';

import { Wifi, WifiOff, CloudOff } from 'lucide-react';
import { useConnectivity, type ConnectivityTier } from '@/lib/live/connectivity';

// Connectivity tile for the offline-first PWA (Phase 6.1, three tiers).
// online       => reports submit immediately + location streams.
// intermittent => link is flaky; submissions queue and replay via Background Sync.
// offline      => capture-only; everything queues on-device until reconnect.
// Detection lives in useConnectivity (navigator events + /api/health probe).
const TIER_UI: Record<ConnectivityTier, {
  Icon: typeof Wifi;
  label: string;
  note: string;
  iconCls: string;
  dotCls: string;
}> = {
  online: {
    Icon: Wifi,
    label: 'Online',
    note: 'Reports submit immediately and your location streams to HQ.',
    iconCls: 'text-active',
    dotCls: 'bg-active',
  },
  intermittent: {
    Icon: WifiOff,
    label: 'Unstable connection',
    note: 'Connection is patchy. Reports are saved on this device and sync automatically as the link recovers.',
    iconCls: 'text-warning',
    dotCls: 'bg-warning',
  },
  offline: {
    Icon: CloudOff,
    label: 'Offline',
    note: 'Reports are saved on this device and sync automatically when you reconnect.',
    iconCls: 'text-critical',
    dotCls: 'bg-critical',
  },
};

export default function ConnectionStatusCard() {
  const tier = useConnectivity();
  const { Icon, label, note, iconCls, dotCls } = TIER_UI[tier];

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon className={`h-4 w-4 ${iconCls}`} />
        <h2 className="text-[13px] font-mono font-semibold uppercase tracking-[0.15em] text-fg">
          Connection
        </h2>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotCls}`} aria-hidden />
          <span className="text-[15px] font-medium text-fg">{label}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-muted">{note}</p>
      </div>
    </section>
  );
}
