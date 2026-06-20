'use client';

import { useEffect, useState } from 'react';

export type ConnectivityTier = 'online' | 'intermittent' | 'offline';

export interface ConnectivitySignals {
  /** navigator.onLine — false means the OS reports no usable network. */
  navigatorOnline: boolean;
  /** Last reachability-probe result; null until the first probe resolves. */
  probeOk: boolean | null;
  /** Coordinator Realtime channel health; null when not applicable (volunteer). */
  realtimeHealthy: boolean | null;
}

/**
 * Pure tier rule. Offline wins outright. Otherwise we may be nominally online
 * (navigator.onLine) yet unable to reach the backend — a failing probe OR a
 * dropped Realtime channel — which is the "intermittent" middle tier. A null
 * probe/realtime is "unknown", which does NOT by itself degrade the tier.
 */
export function classifyConnectivity(s: ConnectivitySignals): ConnectivityTier {
  if (!s.navigatorOnline) return 'offline';
  if (s.probeOk === false || s.realtimeHealthy === false) return 'intermittent';
  return 'online';
}

export interface UseConnectivityOptions {
  /** Reachability probe target. Default: the app's own /api/health. */
  probeUrl?: string;
  /** Probe cadence in ms. Default 10s. */
  intervalMs?: number;
  /** Coordinator Realtime health (from useRealtimeHealth). Omit on volunteer. */
  realtimeHealthy?: boolean | null;
}

/**
 * Live connectivity tier for the current client. Wires navigator online/offline
 * events plus a periodic reachability probe (short timeout). Pass realtimeHealthy
 * on the coordinator so a dropped Realtime channel also reads as intermittent.
 *
 * Not unit-tested (no jsdom). Verify via DevTools — see the plan's verification
 * protocol. All the testable logic lives in classifyConnectivity above.
 */
export function useConnectivity(opts: UseConnectivityOptions = {}): ConnectivityTier {
  const { probeUrl = '/api/health', intervalMs = 10_000, realtimeHealthy = null } = opts;

  // Seed `true` to match SSR (navigator is undefined on the server); the mount effect below
  // reconciles to the real navigator.onLine. Reading navigator.onLine in the initializer would
  // diverge from the server's render and cause a hydration mismatch.
  const [navigatorOnline, setNavigatorOnline] = useState(true);
  const [probeOk, setProbeOk] = useState<boolean | null>(null);

  useEffect(() => {
    const goOnline = () => setNavigatorOnline(true);
    const goOffline = () => setNavigatorOnline(false);
    if (typeof navigator !== 'undefined') setNavigatorOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Re-probe on mount, every intervalMs, and immediately when the OS flips online.
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!cancelled) setProbeOk(false);
        return;
      }
      try {
        const res = await fetch(probeUrl, {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(4_000),
        });
        if (!cancelled) setProbeOk(res.ok);
      } catch {
        if (!cancelled) setProbeOk(false);
      }
    };
    void probe();
    const timer = setInterval(probe, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [probeUrl, intervalMs, navigatorOnline]);

  return classifyConnectivity({ navigatorOnline, probeOk, realtimeHealthy });
}
