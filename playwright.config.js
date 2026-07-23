const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/map-circles',
  outputDir: './test-results/map-circles',
  globalSetup: require.resolve('./tests/map-circles/support/global-setup.cjs'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [
    ['dot'],
    ['html', { outputFolder: 'playwright-report/map-circles', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
