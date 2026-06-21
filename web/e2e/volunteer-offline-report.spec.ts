import { test, expect } from '@playwright/test';
import {
  pickBarangay,
  findReportByMarker,
  deleteReportsByMarker,
} from './helpers/db';
import { waitForServiceWorker, triggerBackgroundSync } from './helpers/serviceWorker';

const COORDINATOR_STATE = 'playwright/.auth/coordinator.json';

test.describe('volunteer offline reporting', () => {
  let marker = '';

  test.afterEach(async () => {
    if (marker) {
      await deleteReportsByMarker(marker);
      marker = '';
    }
  });

  test('offline submit → reconnect → sync (no data loss) → coordinator pin', async ({
    page,
    context,
  }) => {
    marker = `LUWAS-E2E-${crypto.randomUUID().slice(0, 8)}`;
    const barangay = await pickBarangay();

    await page.goto('/volunteer');
    await waitForServiceWorker(page);

    // Choose a barangay through the type-to-filter combobox. Scoped by its
    // accessible name — the native severity/road <select>s are comboboxes too.
    const combo = page.getByRole('combobox', { name: 'Barangay' });
    await combo.click();
    await combo.fill(barangay.name);
    await page.getByRole('option').first().click();
    await expect(combo).toHaveValue(barangay.name);

    // Describe the situation with a unique marker we can find later.
    await page
      .getByPlaceholder(/Flooding near the chapel/)
      .fill(`Flooding reported by E2E. ${marker}`);

    // Go offline and submit — the service worker queues it and answers 202.
    await context.setOffline(true);
    await page.getByRole('button', { name: /Submit report/i }).click();
    await expect(
      page.getByText('Saved offline — syncs automatically on reconnect.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/report.*waiting to sync/i)).toBeVisible();

    // Reconnect and fire Background Sync — the queue drains and the form confirms.
    await context.setOffline(false);
    await triggerBackgroundSync(context, page);
    await expect(page.getByText('Report submitted.')).toBeVisible({ timeout: 30_000 });

    // No data loss: the row reached the database with the submitted fields.
    let row: Awaited<ReturnType<typeof findReportByMarker>> = null;
    await expect
      .poll(
        async () => {
          row = await findReportByMarker(marker);
          return !!row;
        },
        { timeout: 30_000 },
      )
      .toBeTruthy();
    expect(row!.barangay_id).toBe(barangay.id);
    expect(row!.source).toBe('app');

    // Produces a map pin: the report surfaces on the coordinator dashboard.
    const coordinatorContext = await context
      .browser()!
      .newContext({ storageState: COORDINATOR_STATE });
    const coordinatorPage = await coordinatorContext.newPage();
    await coordinatorPage.goto('/coordinator');
    // The dashboard renders every view and hides inactive ones with CSS, so the
    // report's node can exist while still not visible. Retry the nav click (it
    // no-ops until React hydrates) until the Reports panel is active and the
    // synced report shows. The report appears in more than one panel, so first
    // match is enough; the hook's mount fetch + 20s poll backstop the data.
    // The marker renders in two places: a hidden-panel <p> (display:none until that
    // sub-panel is open) and the visible reports-list row. Target the visible match
    // so we don't latch onto the off-screen node. Retry the nav click because it
    // no-ops until React hydrates; the hook's mount fetch + 20s poll backstop the data.
    await expect(async () => {
      await coordinatorPage.getByTestId('nav-reports').click();
      await expect(
        coordinatorPage.getByText(marker).filter({ visible: true }),
      ).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 60_000, intervals: [2_000, 5_000, 10_000] });
    await coordinatorContext.close();
  });
});
