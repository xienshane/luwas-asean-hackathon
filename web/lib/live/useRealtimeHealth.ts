'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Coordinator-only: opens a lightweight Supabase Realtime channel purely to read
// its subscription status. SUBSCRIBED => healthy; CHANNEL_ERROR/TIMED_OUT/CLOSED
// => unhealthy. Feeds useConnectivity so a dropped websocket reads as intermittent
// even while navigator.onLine is still true. Null = not yet known.
export function useRealtimeHealth(): boolean | null {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('connectivity-health').subscribe((status) => {
      if (status === 'SUBSCRIBED') setHealthy(true);
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setHealthy(false);
      }
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return healthy;
}
