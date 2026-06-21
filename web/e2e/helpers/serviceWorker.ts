/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BrowserContext, Page } from '@playwright/test';

// Workbox derives the Background Sync tag from the Queue name ('luwas-report-queue'
// in worker/sw.ts) as `workbox-background-sync:<name>`.
const QUEUE_SYNC_TAG = 'workbox-background-sync:luwas-report-queue';

// Wait until the volunteer service worker is active AND controls the page.
// Registration happens in a mount effect (ServiceWorkerRegistrar) and clientsClaim()
// claims existing clients; a single reload covers the first-load race.
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration('/volunteer');
      return !!reg?.active;
    },
    null,
    { timeout: 30_000 },
  );
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  if (!controlled) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
  }
}

// Fire the Background Sync event deterministically via CDP (the OS event is not
// reliable headless). This drains the workbox queue -> the SW posts
// LUWAS_REPORTS_SYNCED -> the form flips to "Report submitted."
export async function triggerBackgroundSync(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  const origin = new URL(page.url()).origin;

  const registrationId = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no SW registration via CDP')), 10_000);
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e: any) => {
      const reg = (e.registrations ?? []).find((r: any) => r.scopeURL?.startsWith(origin));
      if (reg) {
        clearTimeout(timer);
        resolve(reg.registrationId);
      }
    });
  });

  await cdp.send('ServiceWorker.dispatchSyncEvent', {
    origin,
    registrationId,
    tag: QUEUE_SYNC_TAG,
    lastChance: false,
  });
}
