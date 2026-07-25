const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/journey-map',
  outputDir: './test-results/journey-map',
  globalSetup: require.resolve('./tests/journey-map/support/global-setup.cjs'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [
    ['dot'],
    ['html', { outputFolder: 'playwright-report/journey-map', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
