/// <reference lib="webworker" />
// LUWAS volunteer service worker (Phase 3.2).
// Bundled by scripts/build-sw.mjs (esbuild) into public/sw.js — Next 16 builds
// with Turbopack, so the SW is built outside the Next pipeline on purpose.
import { BackgroundSyncPlugin, Queue } from 'workbox-background-sync';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// ── App shell ───────────────────────────────────────────────────────────────
// Volunteer pages: network first, fall back to the last good copy when offline.
// (The barangay list is SSR-embedded in the page, so the cached HTML carries it.)
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && url.pathname.startsWith('/volunteer'),
  new NetworkFirst({ cacheName: 'volunteer-pages', networkTimeoutSeconds: 3 }),
);

// Hashed, immutable build assets.
registerRoute(
  ({ url }) => url.pathname.startsWith('/_next/static/'),
  new CacheFirst({ cacheName: 'next-static' }),
);

// Icons, logo, manifest.
registerRoute(
  ({ request, url }) => request.destination === 'image' || url.pathname === '/manifest.webmanifest',
  new StaleWhileRevalidate({ cacheName: 'volunteer-assets' }),
);

// ── Background Sync for report submissions ──────────────────────────────────
const SYNC_MESSAGE = 'LUWAS_REPORTS_SYNCED';

// Custom replay: keep-and-retry on network failure / 5xx / auth-not-ready,
// drop on other 4xx (malformed payload would loop forever), notify pages when drained.
const replayReports = async ({ queue }: { queue: Queue }) => {
  let entry;
  while ((entry = await queue.shiftRequest())) {
    let response: Response;
    try {
      response = await fetch(entry.request.clone());
    } catch (err) {
      await queue.unshiftRequest(entry);
      throw err; // still offline — sync manager retries with backoff
    }
    if (response.status === 401 || response.status === 403) {
      await queue.unshiftRequest(entry);
      throw new Error(`auth not ready (${response.status})`);
    }
    if (response.status >= 500) {
      await queue.unshiftRequest(entry);
      throw new Error(`server error (${response.status})`);
    }
  }
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) client.postMessage({ type: SYNC_MESSAGE });
};

const backgroundSync = new BackgroundSyncPlugin('luwas-report-queue', {
  maxRetentionTime: 7 * 24 * 60, // minutes
  onSync: replayReports,
});

// After fetchDidFail queues the request, answer the page with 202 so the form
// can show "saved offline" deterministically.
const queuedResponse = {
  handlerDidError: async () =>
    new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    }),
};

registerRoute(
  ({ url, request }) => request.method === 'POST' && url.pathname === '/api/reports',
  new NetworkOnly({ plugins: [backgroundSync, queuedResponse] }),
  'POST',
);
