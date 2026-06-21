import { test as setup, expect, type Page } from '@playwright/test';

const COORDINATOR_STATE = 'playwright/.auth/coordinator.json';
const VOLUNTEER_STATE = 'playwright/.auth/volunteer.json';
const PASSWORD = 'luwasdemo123';

async function login(page: Page, email: string, landingPath: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole('button', { name: /Authenticate/i }).click();
  // The login server action redirects by role; wait for the landing area.
  await page.waitForURL(`**${landingPath}`, { timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`${landingPath}$`));
}

setup('authenticate coordinator', async ({ page }) => {
  await login(page, 'coordinator@luwas.test', '/coordinator');
  await page.context().storageState({ path: COORDINATOR_STATE });
});

setup('authenticate volunteer', async ({ page }) => {
  await login(page, 'juan@luwas.test', '/volunteer');
  await page.context().storageState({ path: VOLUNTEER_STATE });
});
