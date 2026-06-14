'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

// Connectivity tile for the offline-first PWA: reports cache and queue locally
// when offline and replay on reconnect, so volunteers need to trust the state.
// Lazy-initialised from navigator.onLine; updated only from online/offline events.
export default function ConnectionStatusCard() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        {online ? (
          <Wifi className="h-4 w-4 text-active" />
        ) : (
          <WifiOff className="h-4 w-4 text-warning" />
        )}
        <h2 className="text-[13px] font-mono font-semibold uppercase tracking-[0.15em] text-fg">
          Connection
        </h2>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${online ? 'bg-active' : 'bg-warning'}`}
            aria-hidden
          />
          <span className="text-[15px] font-medium text-fg">{online ? 'Online' : 'Offline'}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-muted">
          {online
            ? 'Reports submit immediately and your location streams to HQ.'
            : 'Reports are saved on this device and sync automatically when you reconnect.'}
        </p>
      </div>
    </section>
  );
}
