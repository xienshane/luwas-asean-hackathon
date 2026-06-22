import { test, expect } from '@playwright/test';
import { getRoute, deleteRoute } from './helpers/db';

test.describe('coordinator dispatch', () => {
  let createdRouteId: string | null = null;

  test.afterEach(async () => {
    if (createdRouteId) {
      await deleteRoute(createdRouteId);
      createdRouteId = null;
    }
  });

  test('load map → see scores → generate route', async ({ page }) => {
    await page.goto('/coordinator');

    // Load map + see scores: the dashboard exposes its loaded counts on a hidden node.
    const stats = page.getByTestId('dashboard-stats');
    await expect(stats).toBeAttached({ timeout: 30_000 });
    await expect
      .poll(async () => Number(await stats.getAttribute('data-barangays')), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => Number(await stats.getAttribute('data-scores')), { timeout: 30_000 })
      .toBeGreaterThan(0);

    // Generate a route: dispatch a team to a barangay from Teams & Dispatch.
    await page.getByTestId('nav-teams').click();
    await page.getByText('Team Sugbo').first().click();

    const destination = page.getByTestId('dispatch-destination');
    await expect(destination).toBeVisible();
    await destination.selectOption({ index: 1 }); // index 0 is the disabled placeholder

    const [dispatchResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/dispatch') && r.request().method() === 'POST',
      ),
      page.getByTestId('dispatch-submit').click(),
    ]);

    expect(dispatchResp.ok()).toBeTruthy();
    const body = (await dispatchResp.json()) as { ok?: boolean; routeId?: string };
    expect(body.routeId).toBeTruthy();
    createdRouteId = body.routeId!;

    // UI reflects the dispatch immediately.
    await expect(page.getByText('Dispatched').first()).toBeVisible({ timeout: 10_000 });

    // The route is a real persisted row (pgRouting real-road dispatch), not just UI state.
    const route = await getRoute(createdRouteId);
    expect(route?.id).toBe(createdRouteId);
  });
});
