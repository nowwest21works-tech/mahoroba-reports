const { test, expect } = require('@playwright/test');
const { deflateSync } = require('node:zlib');
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

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBuffer, data]);
  let crc = 0xffffffff;
  for (const byte of crcInput) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function solidRgbaPng(red, green, blue, alpha = 255) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header[8] = 8;
  header[9] = 6;
  const pixel = Buffer.from([red, green, blue, alpha]);
  const raw = Buffer.alloc(256 * (1 + 256 * 4));
  for (let y = 0; y < 256; y += 1) {
    const start = y * (1 + 256 * 4);
    for (let x = 0; x < 256; x += 1) pixel.copy(raw, start + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function openAreaCanvas(page, {
  emptyData = false, expandSections = true, networkOptions = {},
} = {}) {
  const { researchManifestResponse, ...sandboxOptions } = networkOptions;
  const audit = await installNetworkSandbox(page, sandboxOptions);
  audit.basemapRequests = [];
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7y8AAAAASUVORK5CYII=',
    'base64',
  );
  await page.route(/^https:\/\/(?:cyberjapandata\.gsi\.go\.jp\/xyz\/pale|tile\.openstreetmap\.org)\//, async (route) => {
    audit.basemapRequests.push(route.request().url());
    await route.fulfill({ body: transparentPng, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, status: 200 });
  });
  const pendingResearchReleases = [];
  audit.researchTileRequests = [];
  audit.releaseResearchTiles = async () => {
    await Promise.all(pendingResearchReleases.map((release) => release()));
  };
  await page.route(/^https:\/\/(?:cyberjapandata\.gsi\.go\.jp\/xyz\/(?:lcmfc2|swale)\/|gbank\.gsj\.jp\/seamless\/v2\/api\/1\.3\.1\/tiles\/)/, async (route) => {
    audit.researchTileRequests.push(route.request().url());
    if (sandboxOptions.holdResearchTiles) {
      await new Promise((resolve) => pendingResearchReleases.push(async () => {
        await route.abort('failed').catch(() => {});
        resolve();
      }));
      return;
    }
    await route.abort('failed');
  });
  await page.route(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/(?:hillshademap|relief|slopemap|lum4bl_chubu\d+)\//, async (route) => {
    audit.researchTileRequests.push(route.request().url());
    if (sandboxOptions.holdResearchTiles) {
      await new Promise((resolve) => pendingResearchReleases.push(async () => {
        await route.abort('failed').catch(() => {});
        resolve();
      }));
      return;
    }
    await route.abort('failed');
  });
  audit.demRequests = [];
  await page.route(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/(?:dem1a_png|dem5a_png|dem5b_png|dem5c_png|dem_png)\//, async (route) => {
    audit.demRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: solidRgbaPng(0, 0, 123),
    });
  });
  audit.terrainVectorRequests = [];
  await page.route(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/experimental_landformclassification[12]\//, async (route) => {
    audit.terrainVectorRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/geo+json; charset=utf-8',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
    });
  });
  const riverRequests = [];

  await page.route(`${APP_ORIGIN}${APP_PATH}data/river/aichi.geojson`, (route) => {
    riverRequests.push(route.request().url());
    return route.fulfill({ body: '', status: 404 });
  });

  if (researchManifestResponse) {
    await page.route(`${APP_ORIGIN}${APP_PATH}data/research-layers/manifest.json`, (route) =>
      route.fulfill({
        body: researchManifestResponse.body,
        contentType: 'application/json; charset=utf-8',
        status: researchManifestResponse.status || 200,
      }));
  }

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
  await expect(page.locator('#research-layers-state')).not.toHaveText('レイヤー定義を確認しています。');
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

async function getResearchLayerMetrics(page) {
  return page.evaluate(() => {
    const active = [];
    map.eachLayer((layer) => {
      if (layer.options?.exportRole === 'research') active.push(layer);
    });
    return {
      active: active.length,
      opacities: active.map((layer) => layer.options.opacity),
    };
  });
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

test('Public Research Layer UIは公式情報を示し、7レイヤーを独立制御する', async ({ page }) => {
  await page.addInitScript(() => {
    let renderer;
    Object.defineProperty(window, 'html2canvas', {
      configurable: true,
      get: () => renderer,
      set: (value) => {
        renderer = async (element, options) => {
          const containers = Array.from(element.querySelectorAll('.public-research-layer-container'));
          window.__areaCanvasResearchExport = {
            hiddenContainers: containers.filter((container) => getComputedStyle(container).visibility === 'hidden').length,
          };
          return value(element, options);
        };
      },
    });
  });
  const { audit } = await openAreaCanvas(page, {
    expandSections: false,
    networkOptions: { holdResearchTiles: true },
  });
  await openPanelSection(page, 'geography');
  const checkboxes = page.locator('[data-research-layer]');
  await expect(checkboxes).toHaveCount(7);
  expect(await checkboxes.evaluateAll((items) => items.every((item) => !item.checked))).toBe(true);
  await expect(page.locator('#research-layers-state')).toContainText('レイヤーは個別にON');
  await expect(page.locator('.research-future-layer')).toContainText('活断層図');
  await expect(page.locator('.research-future-layer')).toContainText('公式タイル未接続');
  await expect(page.locator('.research-layer-info:not(.research-layer-legend)')).toHaveCount(7);
  await expect(page.locator('.research-layer-legend')).toHaveCount(7);
  await expect(page.locator('.research-layer-legend > summary')).toHaveText(Array(7).fill('凡例を見る'));
  await page.locator('.research-layer-legend').first().locator('summary').click();
  await expect(page.locator('.research-layer-legend-list').first()).toContainText('扇状地');
  await page.locator('.research-layer-legend').nth(1).locator('summary').click();
  await expect(page.locator('.research-layer-legend-list').nth(1)).toContainText('泥地');
  await page.locator('.research-layer-legend').nth(2).locator('summary').click();
  await expect(page.locator('.research-layer-legend-list').nth(2)).toContainText('堆積岩');
  await expect(page.locator('.research-layer-source-link')).toHaveCount(7);
  await expect(page.locator('.research-layer-terms-link')).toHaveCount(7);
  await expect(page.locator('.research-layer-authority')).toHaveText(Array(7).fill('EVIDENCE候補'));
  await expect(page.locator('#relief-heading')).toHaveText('高低差');
  await expect(page.locator('#modern-land-use-heading')).toHaveText('近現代の土地利用');
  await expect(page.locator('#chubu-land-use-year')).toHaveValue('1997');
  await expect(page.locator('#chubu-land-use-caution')).toContainText('現在の土地利用を示すものではありません');
  await expect(page.locator('[data-research-layer="meiji-lowland"]')
    .locator('xpath=ancestor::div[contains(@class,"research-layer-item")]'))
    .toContainText('現在の災害危険区域を示すものではありません');
  await expect(page.locator('[data-research-layer="landform-classification"]')
    .locator('xpath=ancestor::div[contains(@class,"research-layer-item")]'))
    .toContainText('安全または該当地形なしとは判断できません');
  await expect(page.locator('#research-opacity')).toHaveValue('65');

  await page.evaluate(() => map.setZoom(13));
  await page.locator('[data-research-layer="landform-classification"]').check();
  await page.locator('[data-research-layer="meiji-lowland"]').check();
  await page.locator('[data-research-layer="seamless-geology"]').check();
  await expect.poll(async () => (await getResearchLayerMetrics(page)).active).toBe(3);
  await expect(page.locator('#map .leaflet-control-attribution')).toContainText('国土地理院');
  await expect(page.locator('#map .leaflet-control-attribution')).toContainText('産業技術総合研究所');
  expect(await page.evaluate(() => map.getPane('public-research-pane').style.zIndex)).toBe('280');
  await expect.poll(() => audit.researchTileRequests.some((url) => url.includes('/tiles/')))
    .toBe(true);
  expect(audit.researchTileRequests.some((url) => url.includes('/xyz/swale/'))).toBe(true);
  expect(audit.researchTileRequests.some((url) => url.includes('/xyz/lcmfc2/'))).toBe(true);

  await page.evaluate(async () => {
    const baseTilesLoaded = new Promise((resolve) => baseTileLayer.once('load', resolve));
    map.setZoom(14);
    await baseTilesLoaded;
  });
  await page.locator('#export-map-png').click();
  await expect(page.locator('#map-export-state')).toContainText('Public Research Layerは画像に含まれていません');
  expect(await page.evaluate(() => window.__areaCanvasResearchExport.hiddenContainers)).toBeGreaterThan(0);
  const printPopupPromise = page.waitForEvent('popup');
  await page.locator('#export-map-pdf').click();
  const printPopup = await printPopupPromise;
  await expect(printPopup.locator('.print-footer')).toContainText('Public Research Layerは出力画像に含めていません');

  await page.locator('#research-opacity').fill('45');
  await expect.poll(async () => {
    const opacities = (await getResearchLayerMetrics(page)).opacities;
    return opacities.length >= 2 && opacities.every((opacity) => opacity === 0.45);
  }).toBe(true);
  await page.evaluate(() => map.setZoom(13));
  await expect.poll(async () => (await getResearchLayerMetrics(page)).active).toBe(3);
  await expect.poll(async () => (await getResearchLayerMetrics(page)).opacities)
    .toEqual([0.45, 0.45, 0.45]);
  await page.locator('[data-research-layer="meiji-lowland"]').uncheck();
  await expect.poll(async () => (await getResearchLayerMetrics(page)).active).toBe(2);

  await audit.releaseResearchTiles();
  await expect(page.locator('[data-research-layer="landform-classification"]')).toBeChecked();
  await expect(page.locator('[data-research-layer="seamless-geology"]')).toBeChecked();
  await expect(page.locator('[data-research-state="landform-classification"]'))
    .toContainText('タイルを取得できませんでした');
  await expect.poll(async () => (await getResearchLayerMetrics(page)).active).toBe(2);
  expect(audit.unexpectedExternal).toEqual([]);
  await page.reload();
  await expect(page.locator('#research-layers-state')).not.toHaveText('レイヤー定義を確認しています。');
  expect(await page.locator('[data-research-layer]').evaluateAll((items) => items.every((item) => !item.checked))).toBe(true);
});

test('unsupported zoom and invalid Public Research manifest fail closed', async ({ page }) => {
  await openAreaCanvas(page, {
    expandSections: false,
    networkOptions: { researchManifestResponse: {
      body: '{broken',
    } },
  });
  await openPanelSection(page, 'geography');
  await expect(page.locator('#research-layers-state')).toContainText('レイヤー定義を確認できません');
  await expect(page.locator('[data-research-layer]')).toHaveCount(0);
});

test('GSJ is upscaled above native zoom 13 with a precision caution', async ({ page }) => {
  await openAreaCanvas(page, { expandSections: false });
  await openPanelSection(page, 'geography');
  await page.evaluate(() => map.setZoom(14));
  const geology = page.locator('[data-research-layer="seamless-geology"]');
  await geology.click();
  await expect(geology).toBeChecked();
  await expect(page.locator('[data-research-resolution="seamless-geology"]')).toContainText('敷地境界レベルの精密判定には使用しません');
  const options = await page.evaluate(() => {
    const layers = [];
    map.eachLayer((layer) => { if (layer.options?.researchLayerId === 'seamless-geology') layers.push(layer.options); });
    return layers[0];
  });
  expect(options.maxNativeZoom).toBe(13);
  expect(options.maxZoom).toBe(18);
});

test('Pack 02 terrain overlays share opacity and keep partial failures enabled', async ({ page }) => {
  await openAreaCanvas(page, { expandSections: false });
  await openPanelSection(page, 'geography');
  const hillshade = page.locator('[data-research-layer="gsi-hillshade"]');
  const relief = page.locator('[data-research-layer="gsi-relief"]');
  const slope = page.locator('[data-research-layer="gsi-slope"]');
  await hillshade.check();
  await relief.check();
  await slope.check();
  await expect(hillshade).toBeChecked();
  await expect(relief).toBeChecked();
  await expect(slope).toBeChecked();
  await page.locator('#research-opacity').fill('42');
  await expect.poll(async () => {
    return page.evaluate(() => {
      const layers = [];
      map.eachLayer((layer) => { if (layer.options?.exportRole === 'research') layers.push(layer.options.opacity); });
      return layers.length === 3 && layers.every((opacity) => opacity === 0.42);
    });
  }).toBeTruthy();
  await expect(page.locator('.research-layer-legend')).toHaveCount(7);
});

test('Chubu land-use year selector permits only listed years and swaps a single layer', async ({ page }) => {
  const { audit } = await openAreaCanvas(page, { expandSections: false });
  await openPanelSection(page, 'geography');
  const year = page.locator('#chubu-land-use-year');
  const toggle = page.locator('[data-research-layer="chubu-land-use"]');
  await expect(year.locator('option')).toHaveText(['1977', '1982', '1987', '1991', '1997']);
  await expect(toggle).not.toBeChecked();
  await year.selectOption('1977');
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect.poll(() => audit.researchTileRequests.some((url) => url.includes('/lum4bl_chubu1977/'))).toBe(true);
  await year.selectOption('1982');
  await expect.poll(() => audit.researchTileRequests.some((url) => url.includes('/lum4bl_chubu1982/'))).toBe(true);
  await expect.poll(async () => (await getResearchLayerMetrics(page)).active).toBe(1);
  expect(audit.researchTileRequests.some((url) => url.includes('/lum4bl_chubu1987/'))).toBe(false);
  await year.selectOption('1997');
  await expect.poll(() => audit.researchTileRequests.some((url) => url.includes('/lum4bl_chubu1997/'))).toBe(true);
  await toggle.uncheck();
  await expect.poll(async () => (await getResearchLayerMetrics(page)).active).toBe(0);
  expect(audit.unexpectedExternal).toEqual([]);
});

test('Pack 02 E2E overlay health reports partial state without disabling', async ({ page }) => {
  await openAreaCanvas(page, { expandSections: false });
  let tileCount = 0;
  await page.route('https://cyberjapandata.gsi.go.jp/xyz/hillshademap/**', async (route) => {
    tileCount += 1;
    if (tileCount === 1) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7y8AAAAASUVORK5CYII=', 'base64') });
  });
  await openPanelSection(page, 'geography');
  const toggle = page.locator('[data-research-layer="gsi-hillshade"]');
  await toggle.check();
  await expect.poll(() => page.locator('[data-research-state="gsi-hillshade"]').getAttribute('data-kind')).toBe('warning');
  await expect(toggle).toBeChecked();
});

test('公式タイル全件失敗はUNAVAILABLE表示でも選択を保持する', async ({ page }) => {
  const { audit } = await openAreaCanvas(page, { expandSections: false });
  await openPanelSection(page, 'geography');
  const layer = page.locator('[data-research-layer="meiji-lowland"]');
  await layer.check();
  await expect(page.locator('[data-research-state="meiji-lowland"]'))
    .toContainText('表示できません／未確認');
  await expect(layer).toBeChecked();
  await expect.poll(() => page.locator('[data-research-state="meiji-lowland"]').getAttribute('data-kind'))
    .toBe('error');
  await expect.poll(async () => (await getResearchLayerMetrics(page)).active).toBe(1);
  expect(audit.researchTileRequests.some((url) => url.includes('/xyz/swale/'))).toBe(true);
  expect(audit.unexpectedExternal).toEqual([]);
});

test('一部の地理院タイルだけ失敗した場合はPARTIALのままONを保つ', async ({ page }) => {
  const { audit } = await openAreaCanvas(page, { expandSections: false });
  let requestCount = 0;
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7y8AAAAASUVORK5CYII=', 'base64');
  await page.route('https://cyberjapandata.gsi.go.jp/xyz/lcmfc2/**', async (route) => {
    requestCount += 1;
    if (requestCount === 1) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'image/png', body: transparentPng });
  });
  await openPanelSection(page, 'geography');
  const layer = page.locator('[data-research-layer="landform-classification"]');
  await layer.check();
  await expect(page.locator('[data-research-state="landform-classification"]'))
    .toContainText('一部範囲では表示できない場合があります');
  await expect(layer).toBeChecked();
  expect(requestCount).toBeGreaterThan(1);
  expect(audit.unexpectedExternal).toEqual([]);
});

test('共通Map Inspector is opt-in, reports GSI terrain and GSJ fields, and preserves default circle click', async ({ page }) => {
  const { audit } = await openAreaCanvas(page, { expandSections: false });
  await page.route(/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/experimental_landformclassification[12]\//, (route) => {
    audit.terrainVectorRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/geo+json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      type: 'FeatureCollection', features: [{ type: 'Feature', properties: { code: 10503 }, geometry: {
        type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]],
      } }],
    }) });
  });
  await page.route('https://gbank.gsj.jp/seamless/v2/api/1.3.1/legend.json?point=*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      formationAge_ja: '新生代 第四紀', group_ja: '堆積岩', lithology_ja: '砂礫', title: '公式凡例タイトル',
    }) }));
  await openPanelSection(page, 'geography');
  await expect(page.locator('#geology-identify-mode')).not.toBeChecked();
  await page.locator('[data-research-layer="seamless-geology"]').check();
  await page.locator('#map').click({ position: { x: 420, y: 340 } });
  expect(audit.terrainVectorRequests).toHaveLength(0);
  await page.locator('#geology-identify-mode').check();
  const circlesBefore = await page.locator('.circle-item').count();
  await page.locator('#map').click({ position: { x: 420, y: 340 } });
  await expect(page.locator('#geology-identify-result')).toContainText('地形分類：自然堤防');
  await expect(page.locator('#geology-identify-result')).toContainText('土地の成り立ち：');
  await expect(page.locator('#geology-identify-result')).toContainText('一般的な自然災害リスク：');
  await expect(page.locator('#geology-identify-result')).toContainText('個別地点の危険度判定ではありません');
  await expect(page.locator('#geology-identify-result')).toContainText('出典：国土地理院 ベクトルタイル');
  await expect(page.locator('#geology-identify-result')).toContainText('地質年代：新生代 第四紀');
  await expect(page.locator('#geology-identify-result')).toContainText('公式凡例タイトル');
  await expect(page.locator('#geology-identify-result')).toContainText('出典：産総研GSJ');
  await expect(page.locator('#geology-identify-result')).toContainText('標高：約 1.23 m');
  await expect(page.locator('#geology-identify-result')).toContainText('DEM種別：DEM1A');
  expect(audit.terrainVectorRequests).toHaveLength(2);
  expect(audit.demRequests.some((url) => url.includes('/dem1a_png/17/'))).toBe(true);
  expect(await page.locator('.circle-item').count()).toBe(circlesBefore);
  await page.locator('[data-research-layer="seamless-geology"]').uncheck();
  await expect(page.locator('#geology-identify-mode')).toBeChecked();
  await page.locator('#geology-identify-mode').uncheck();
  await page.locator('#map').click({ position: { x: 420, y: 340 } });
  await expect(page.locator('.circle-item')).toHaveCount(circlesBefore + 1);
});

test('GSJ Identify failure and empty response fail closed', async ({ page }) => {
  await openAreaCanvas(page, { expandSections: false });
  await page.route('https://gbank.gsj.jp/seamless/v2/api/1.3.1/legend.json?point=*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await openPanelSection(page, 'geography');
  await page.locator('[data-research-layer="seamless-geology"]').check();
  await page.locator('#geology-identify-mode').check();
  await page.locator('#map').click({ position: { x: 420, y: 340 } });
  await expect(page.locator('#geology-identify-result')).toContainText('この地点の地質情報を確認できませんでした');
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

test('地理院淡色が標準背景で、OSMは明示選択時のみ切り替わる', async ({ page }) => {
  const { audit } = await openAreaCanvas(page);
  const initial = await page.evaluate(() => ({
    url: baseTileLayer._url,
    activeBaseLayers: (() => {
      const layers = [];
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer && layer.options.exportRole === 'base' && layer._map === map) {
          layers.push(layer._url);
        }
      });
      return layers;
    })(),
  }));
  expect(initial.url).toBe('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png');
  expect(initial.activeBaseLayers).toEqual([initial.url]);
  await expect(page.locator('.footer-note')).not.toContainText('OpenStreetMap contributors');
  await expect(page.locator('#basemap-select')).toHaveValue('gsiPale');
  await expect(page.locator('.leaflet-control-attribution')).toContainText('国土地理院 / 地理院タイル');
  await expect(page.locator('.leaflet-control-attribution a[href="https://maps.gsi.go.jp/development/ichiran.html"]')).toBeVisible();

  await page.locator('#basemap-select').selectOption('osm');
  await expect.poll(() => page.evaluate(() => baseTileLayer._url))
    .toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap contributors');
  const selectedBaseLayers = await page.evaluate(() => {
    const layers = [];
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer && layer.options.exportRole === 'base' && layer._map === map) {
        layers.push(layer._url);
      }
    });
    return layers;
  });
  expect(selectedBaseLayers).toEqual(['https://tile.openstreetmap.org/{z}/{x}/{y}.png']);

  await page.locator('#basemap-select').selectOption('gsiPale');
  await expect.poll(() => page.evaluate(() => baseTileLayer._url))
    .toBe('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png');
  expect(audit.basemapRequests.some((url) => url.startsWith('https://cyberjapandata.gsi.go.jp/xyz/pale/'))).toBe(true);
  expect(audit.basemapRequests.some((url) => url.startsWith('https://tile.openstreetmap.org/'))).toBe(true);
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
