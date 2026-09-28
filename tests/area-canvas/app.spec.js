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

async function openAreaCanvas(page, {
  emptyData = false, expandSections = true, networkOptions = {},
} = {}) {
  const audit = await installNetworkSandbox(page, networkOptions);
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
  if (expandSections) {
    await page.locator('#panel details[data-panel-section]').evaluateAll((sections) => {
      sections.forEach((section) => { section.open = true; });
    });
  }
  return { audit, riverRequests };
}

async function openPanelSection(page, key) {
  const section = page.locator(`#panel > details[data-panel-section="${key}"]`);
  if (!(await section.evaluate((element) => element.open))) {
    await section.locator(':scope > summary').click();
  }
  return section;
}

test('9つのTop-level順序、既定値、統合内容と独立開閉', async ({ page }) => {
  await openAreaCanvas(page, { expandSections: false });
  const sections = page.locator('#panel > details[data-panel-section]');
  expect(await sections.evaluateAll((items) => items.map((item) => item.dataset.panelSection)))
    .toEqual(['radius', 'color-label', 'map-notes', 'circles', 'project', 'search', 'map-mode', 'geography', 'help']);
  expect(await sections.evaluateAll((items) => items.filter((item) => item.open).map((item) => item.dataset.panelSection)))
    .toEqual(['radius', 'color-label', 'map-notes', 'circles', 'project']);
  expect(await sections.evaluateAll((items) => items.filter((item) => !item.open).map((item) => item.dataset.panelSection)))
    .toEqual(['search', 'map-mode', 'geography', 'help']);

  await expect(page.locator('[data-panel-section="search"] #area-preset-buttons')).toBeAttached();
  await expect(page.locator('[data-panel-section="geography"] [data-hazard="flood"]')).toBeAttached();
  await expect(page.locator('[data-panel-section="geography"] #urban-area-classification-toggle')).toBeAttached();
  await expect(page.locator('[data-panel-section="geography"] #deep-time-enabled')).toBeAttached();
  await expect(page.locator('[data-panel-section="help"]')).toContainText('形を変える');
  await expect(page.locator('[data-panel-section="road-labels"]')).toHaveCount(0);
  await expect(page.locator('#road-label-state')).toBeAttached();
  await expect(page.locator('#road-label-state')).toBeHidden();

  const project = page.locator('[data-panel-section="project"]');
  const geography = await openPanelSection(page, 'geography');
  await expect(project).toHaveAttribute('open', '');
  await expect(geography).toHaveAttribute('open', '');
  const help = page.locator('[data-panel-section="help"]');
  await help.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(help).toHaveAttribute('open', '');
  await expect(geography).toHaveAttribute('open', '');
  await project.locator('summary').click();
  await expect(project).not.toHaveAttribute('open');
  await page.reload();
  await expect(geography).toHaveAttribute('open', '');
  await expect(project).not.toHaveAttribute('open');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mahorobaAreaCanvas.panelSections.v1')));
  expect(stored.schemaVersion).toBe(2);
  expect(Object.keys(stored.sections)).toEqual(['radius', 'color-label', 'map-notes', 'circles', 'project', 'search', 'map-mode', 'geography', 'help']);
  await page.evaluate(() => localStorage.setItem('mahorobaAreaCanvas.panelSections.v1', '{broken'));
  await page.reload();
  await expect(project).toHaveAttribute('open', '');
  await expect(geography).not.toHaveAttribute('open');
  await expect(page.locator('[data-panel-section="search"]')).not.toHaveAttribute('open');
  const recovered = await page.evaluate(() => JSON.parse(localStorage.getItem('mahorobaAreaCanvas.panelSections.v1')));
  expect(recovered.schemaVersion).toBe(2);
  expect(recovered.sections.project).toBe(true);
  expect(recovered.sections.geography).toBe(false);
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await page.getByRole('button', { name: 'パネルを閉じる' }).click();
  await expect(page.locator('#panel')).toHaveClass(/collapsed/);
  await page.getByRole('button', { name: 'パネルを開く' }).click();
  await expect(page.locator('#panel')).not.toHaveClass(/collapsed/);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('#project-state')).toContainText('保存済み');
  const persistedProjects = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('mahorobaAreaCanvas', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction('mapProjects').objectStore('mapProjects').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return records;
  });
  expect(persistedProjects.length).toBe(1);
  expect(persistedProjects[0]).not.toHaveProperty('panelSections');
});

test('旧15-section localStorageは新しい安全な既定値へ移行する', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mahorobaAreaCanvas.panelSections.v1', JSON.stringify({
    project: false, 'map-mode': true, search: true, 'area-preset': true, geography: true,
    'road-labels': true, 'deep-time': true, 'urban-planning': true, hazards: true,
    radius: false, 'color-label': false, 'map-notes': false, circles: false,
    'drawing-guide': true, help: true,
  })));
  await openAreaCanvas(page, { expandSections: false });
  const states = await page.locator('#panel > details[data-panel-section]')
    .evaluateAll((items) => Object.fromEntries(items.map((item) => [item.dataset.panelSection, item.open])));
  expect(states).toEqual({
    radius: true, 'color-label': true, 'map-notes': true, circles: true, project: true,
    search: false, 'map-mode': false, geography: false, help: false,
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mahorobaAreaCanvas.panelSections.v1')));
  expect(stored.schemaVersion).toBe(2);
  expect(Object.keys(stored.sections)).toHaveLength(9);
});

test('Deep Timeは未接続データを描画せず既存操作を維持する', async ({ page }) => {
  await openAreaCanvas(page, { expandSections: false });
  await openPanelSection(page, 'geography');
  await expect(page.locator('#deep-time-enabled')).not.toBeChecked();
  await expect(page.locator('[name="deep-time-era"][value="present"]')).toBeChecked();
  await expect(page.locator('#deep-time-opacity')).toHaveValue('60');
  await expect(page.locator('#deep-time-controls')).toHaveAttribute('disabled', '');
  await expect(page.locator('[data-deep-time-overlay="buried-valley"]')).toBeDisabled();
  await page.locator('#deep-time-enabled').check();
  await page.locator('[name="deep-time-era"][value="jomon"]').check();
  await expect(page.locator('#deep-time-state')).toContainText('復元データ準備中');
  await expect(page.locator('[data-deep-time-overlay="buried-valley"]')).toBeDisabled();
  await page.locator('#deep-time-opacity').fill('80');
  await expect(page.locator('#deep-time-opacity-val')).toHaveText('80%');
  await page.locator('#deep-time-enabled').uncheck();
  await expect(page.locator('#deep-time-controls')).toHaveAttribute('disabled', '');
  await expect(page.locator('[name="deep-time-era"][value="jomon"]')).toBeDisabled();
  await page.reload();
  await expect(page.locator('#deep-time-enabled')).not.toBeChecked();
  await expect(page.locator('[name="deep-time-era"][value="present"]')).toBeChecked();
  await expect(page.locator('#deep-time-opacity')).toHaveValue('60');
  await page.locator('#map').click({ position: { x: 300, y: 200 } });
  await expect(page.locator('#circle-list .circle-item')).toHaveCount(1);
  await page.locator('[data-hazard="flood"]').check();
  await expect(page.locator('[data-hazard="flood"]')).toBeChecked();
});

test('破損したDeep Time manifestは安全に無効化される', async ({ page }) => {
  await openAreaCanvas(page, { expandSections: false });
  await page.route(`${APP_ORIGIN}${APP_PATH}data/deep-time/manifest.json`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{broken' }));
  await openPanelSection(page, 'geography');
  await page.locator('#deep-time-enabled').check();
  await expect(page.locator('#deep-time-state')).toContainText('データ定義を確認できません');
  await expect(page.locator('[data-deep-time-overlay="geology"]')).toBeDisabled();
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
});

test('既存の検索、エリアプリセット、地図メモと書き出し導線を維持する', async ({ page }) => {
  const { audit } = await openAreaCanvas(page, {
    expandSections: false,
    networkOptions: { nominatimResponse: {
      body: JSON.stringify([{ lat: '35.1709', lon: '136.8815', display_name: '名古屋駅, 愛知県' }]),
      status: 200,
    } },
  });
  await openPanelSection(page, 'search');
  await page.locator('#search-input').fill('名古屋駅');
  await page.locator('#search-btn').click();
  await expect(page.locator('#circle-list .circle-item')).toHaveCount(1);
  expect(audit.nominatimRequests).toHaveLength(1);

  await page.locator('[data-area="nagoya"]').click();
  await expect(page.locator('#status')).toContainText('名古屋市');

  await expect(page.locator('[data-panel-section="map-notes"]')).toHaveAttribute('open', '');
  await page.locator('#map-note-input').fill('現地確認メモ');
  await page.locator('#place-map-note').click();
  await page.locator('#map').click({ position: { x: 320, y: 220 } });
  await expect(page.locator('#map-note-state')).toContainText('現地確認メモ');
  await expect(page.locator('#export-map-png')).toBeVisible();
  await expect(page.locator('#export-map-pdf')).toBeVisible();
});

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
