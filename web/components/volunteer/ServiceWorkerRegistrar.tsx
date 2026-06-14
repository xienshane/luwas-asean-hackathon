'use client';

import { useEffect } from 'react';

// Production-only: a caching SW in dev serves stale chunks and fights HMR.
// Scope /volunteer keeps the coordinator dashboard outside the PWA entirely.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/volunteer' })
      .catch((err) => console.warn('LUWAS service worker registration failed', err));
  }, []);
  return null;
}
