const { test, expect } = require('@playwright/test');
const {
  APP_ORIGIN,
  installNetworkSandbox,
} = require('../journey-map/support/map-test-helpers');

const APP_PATH = '/mahoroba-reports/area-canvas/';
const PUBLIC_LAYERS = {
  'administrative-boundary': 1033,
  railway: 1697,
  road: 3,
};
const EMPTY_FEATURE_COLLECTION = JSON.stringify({
  type: 'FeatureCollection',
  features: [],
});

async function openAreaCanvas(page, { emptyData = false } = {}) {
  const audit = await installNetworkSandbox(page);
  const riverRequests = [];

  await page.route(`${APP_ORIGIN}${APP_PATH}data/river/aichi.geojson`, (route) => {
    riverRequests.push(route.request().url());
    return route.fulfill({ body: '', status: 404 });
  });

  if (emptyData) {
    for (const key of Object.keys(PUBLIC_LAYERS)) {
      await page.route(
        `${APP_ORIGIN}${APP_PATH}data/${key}/aichi.geojson`,
        (route) => route.fulfill({
          body: EMPTY_FEATURE_COLLECTION,
          contentType: 'application/geo+json; charset=utf-8',
          status: 200,
        }),
      );
    }
  }

  await page.goto(APP_PATH);
  await page.locator('#map.leaflet-container').waitFor();
  return { audit, riverRequests };
}

test('空FeatureCollectionでも4レイヤーと表示モードがcrashしない', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const { audit, riverRequests } = await openAreaCanvas(page, { emptyData: true });

  for (const key of Object.keys(PUBLIC_LAYERS)) {
    const toggle = page.locator(`[data-base-layer="${key}"]`);
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.locator(`[data-base-layer-state="${key}"]`)).toContainText('0件');
  }
  await expect(page.locator('[data-base-layer="river"]')).toBeDisabled();
  await expect(page.locator('[data-base-layer-state="river"]')).toContainText('公開版ではデータ未提供');
  expect(riverRequests).toEqual([]);

  for (const mode of ['white', 'rail', 'road', 'real']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await expect(page.locator(`[data-mode="${mode}"]`)).toHaveAttribute('aria-pressed', 'true');
  }

  await expect(page.locator('#map')).toBeVisible();
  expect(errors).toEqual([]);
  expect(audit.unexpectedExternal).toEqual([]);
});

test('公式実データ4レイヤーを読込み、路線／車移動モードを共存させる', async ({ page }) => {
  const errors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  const { audit, riverRequests } = await openAreaCanvas(page);

  for (const [key, count] of Object.entries(PUBLIC_LAYERS)) {
    await page.locator(`[data-base-layer="${key}"]`).click();
    await expect(page.locator(`[data-base-layer-state="${key}"]`)).toContainText(`ON（${count}件）`);
  }

  await page.locator('[data-mode="rail"]').click();
  await expect(page.locator('[data-base-layer="railway"]')).toBeChecked();
  await expect(page.locator('[data-base-layer="road"]')).not.toBeChecked();

  await page.locator('[data-mode="road"]').click();
  await expect(page.locator('[data-base-layer="railway"]')).not.toBeChecked();
  await expect(page.locator('[data-base-layer="road"]')).toBeChecked();
  await expect(page.locator('#basemap-opacity')).toHaveValue('20');
  await expect(page.locator('#basemap-grayscale')).toBeChecked();

  expect(errors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(riverRequests).toEqual([]);
  expect(audit.unexpectedExternal).toEqual([]);
});

test('1366x1024でLeaflet、Geoman、IndexedDB保存を維持する', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  await openAreaCanvas(page, { emptyData: true });

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    mapWidth: document.querySelector('#map').getBoundingClientRect().width,
    panelWidth: document.querySelector('#panel').getBoundingClientRect().width,
    viewportWidth: innerWidth,
  }));
  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(layout.panelWidth).toBe(360);
  expect(layout.mapWidth).toBe(1006);

  const touchTargets = await page.evaluate(() => {
    const sizes = (selector) => Array.from(document.querySelectorAll(selector))
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      });
    return {
      areaPresets: sizes('#area-preset-buttons button'),
      layerRows: sizes('.base-layer-row'),
      mapModes: sizes('.mode-btn'),
      mapToolbar: sizes('#map .leaflet-pm-toolbar .leaflet-buttons-control-button'),
      zoom: sizes('#map .leaflet-control-zoom a'),
    };
  });
  for (const targets of Object.values(touchTargets)) {
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);
  }

  await page.getByRole('button', { name: '地点を置く' }).click();
  expect(await page.evaluate(() => map.pm.globalDrawModeEnabled())).toBe(true);
  await page.getByRole('button', { name: '地点を置く' }).click();
  expect(await page.evaluate(() => map.pm.globalDrawModeEnabled())).toBe(false);

  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('#project-state')).toContainText('保存済み');
  expect(await page.evaluate(async () => indexedDB.databases())).toEqual([
    { name: 'mahorobaAreaCanvas', version: 1 },
  ]);
});
