import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

// Load web/.env(.local) into the test-runner process so helpers can build a
// service-role Supabase client. next start loads them for the server itself.
loadEnvConfig(process.cwd());

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Shared DB + a single service worker: keep it serial and deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // MapLibre needs WebGL; SwiftShader gives headless Chromium a software GL.
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'coordinator',
      testMatch: /coordinator-.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/coordinator.json' },
    },
    {
      name: 'volunteer',
      testMatch: /volunteer-.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/volunteer.json' },
    },
  ],
  webServer: {
    command: 'npm run build && npm run start',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
