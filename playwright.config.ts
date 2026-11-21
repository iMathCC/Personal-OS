import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de navegador contra o Worker local isolado (HTTPS com certificado
 * autoassinado). O ambiente é criado por `npm run test:e2e:env`.
 */
export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'https://localhost:8788',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--ignore-certificate-errors'] },
      },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
