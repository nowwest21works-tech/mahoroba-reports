const { test, expect } = require('@playwright/test');
const {
  clickMap,
  getAppState,
  getMapState,
  openMap,
} = require('./support/map-test-helpers');

const uuid = (suffix) => [
  '00000000',
  '0000',
  '4000',
  '8000',
  `00000000${suffix}`,
].join('-');
const PROJECT_ID = uuid('0401');
const FEATURE_IDS = {
  marker: uuid('0411'),
  circle: uuid('0412'),
  line: uuid('0413'),
  polygon: uuid('0414'),
};

function mixedFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: FEATURE_IDS.marker,
        geometry: { type: 'Point', coordinates: [136.88, 35.17] },
        properties: { schemaVersion: 1, kind: 'marker', label: '架空地点A' },
      },
      {
        type: 'Feature',
        id: FEATURE_IDS.circle,
        geometry: { type: 'Point', coordinates: [136.89, 35.18] },
        properties: {
          schemaVersion: 1,
          kind: 'circle',
          radiusMeters: 800,
          color: '#c8443a',
          label: '架空の円A',
        },
      },
      {
        type: 'Feature',
        id: FEATURE_IDS.line,
        geometry: {
          type: 'LineString',
          coordinates: [[136.87, 35.16], [136.88, 35.17]],
        },
        properties: {
          schemaVersion: 1,
          kind: 'line',
          color: '#3a8c5f',
          label: '架空の線A',
        },
      },
      {
        type: 'Feature',
        id: FEATURE_IDS.polygon,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [136.86, 35.15],
            [136.87, 35.15],
            [136.87, 35.16],
            [136.86, 35.15],
          ]],
        },
        properties: {
          schemaVersion: 1,
          kind: 'polygon',
          color: '#7a4e9c',
          label: '架空の範囲A',
        },
      },
    ],
  };
}

async function waitForProjectManager(page) {
  await expect(page.locator('#project-state')).not.toHaveText('保存状態を確認中');
}

async function seedMixedRuntime(page, viewport = {
  center: { lat: 35.2, lng: 136.9 },
  zoom: 12,
}) {
  await page.evaluate(({ featureCollection, viewport }) => {
    MapCirclesAppState.replaceProjectState(featureCollection, viewport);
  }, {
    featureCollection: mixedFeatureCollection(),
    viewport,
  });
}

async function saveProject(page) {
  await page.locator('#save-project').click();
  await expect(page.locator('#project-state')).toContainText('保存済み');
  return page.evaluate(async () => {
    const records = await JourneyMapIndexedDb.listProjects();
    return records[0];
  });
}

function backupRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    householdCode: 'HH-010',
    journeyName: '土地探し 第2回',
    mapProjectName: '架空バックアップ',
    featureCollection: mixedFeatureCollection(),
    viewport: {
      center: { lat: 35.22, lng: 136.92 },
      zoom: 11,
    },
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T01:00:00.000Z',
    ...overrides,
  };
}

test.describe('日本語操作とローカル地図プロジェクト', () => {
  test('Geomanの日本語label、tooltip、aria-labelと操作ガイドを表示する', async ({
    page,
  }) => {
    await openMap(page);
    await waitForProjectManager(page);

    const labels = [
      ['marker', '地点を置く'],
      ['circle', '円を描く'],
      ['polyline', '線を描く'],
      ['polygon', '範囲を描く'],
      ['edit', '形を編集'],
      ['drag', '全体を移動'],
      ['delete', '削除する'],
    ];
    for (const [icon, label] of labels) {
      const control = page.locator(`.leaflet-pm-icon-${icon}`).locator('xpath=..');
      await expect(control).toHaveAttribute('title', label);
      await expect(control).toHaveAttribute('aria-label', label);
    }
    await expect(page.locator('.operation-guide')).toContainText(
      '形を変える：［形を編集］→ 頂点を動かす',
    );
    expect(await page.evaluate(() => L.PM.activeLang)).toBe('ja');
    await page.evaluate(() => map.pm.enableDraw('Marker'));
    const mapBox = await page.locator('#map').boundingBox();
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await expect(page.locator('.leaflet-tooltip')).toContainText(
      'クリックして地点を置く',
    );
    await page.evaluate(() => map.pm.disableDraw('Marker'));
  });

  test('新しい地図は未保存変更を確認し、取消時は現在の地図を維持する', async ({
    page,
  }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await clickMap(page);
    await expect(page.locator('#project-state')).toContainText('未保存の変更あり');

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#new-project').click();
    expect((await getMapState(page)).circles).toHaveLength(1);

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#new-project').click();
    expect((await getMapState(page)).circles).toEqual([]);
    await expect(page.locator('#project-state')).toContainText('未保存の新しい地図');
  });

  test('初回保存でUUID recordをIndexedDBへ保存しupdatedAt順の一覧に表示する', async ({
    page,
  }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await clickMap(page);
    const record = await saveProject(page);

    expect(record.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(record.householdCode).toBe('HH-001');
    expect(record.featureCollection.features).toHaveLength(1);
    expect(new Date(record.updatedAt).toISOString()).toBe(record.updatedAt);
    expect(await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('mahorobaJourneyMaps');
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('mapProjects', 'readonly');
        const store = transaction.objectStore('mapProjects');
        resolve({
          indexNames: Array.from(store.indexNames),
          keyPath: store.keyPath,
        });
        database.close();
      };
      request.onerror = () => reject(request.error);
    }))).toEqual({
      indexNames: ['updatedAt'],
      keyPath: 'projectId',
    });
  });

  test('reload後も保存済み一覧を表示するが自動では地図を開かない', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await page.locator('#map-project-name').fill('リロード確認地図');
    const record = await saveProject(page);

    await page.reload();
    await page.locator('#map.leaflet-container').waitFor();
    await waitForProjectManager(page);

    await expect(page.locator(`#saved-projects option[value="${record.projectId}"]`))
      .toContainText('リロード確認地図');
    expect((await getAppState(page)).mapProject.featureCollection.features).toEqual([]);
  });

  test('保存済み地図を開きviewportと4種類の図形を復元する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    const viewport = { center: { lat: 35.2, lng: 136.9 }, zoom: 12 };
    await seedMixedRuntime(page, viewport);
    const record = await saveProject(page);

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#new-project').click();
    await page.locator('#saved-projects').selectOption(record.projectId);
    await page.locator('#open-project').click();

    const state = await getAppState(page);
    expect(state.mapProject.featureCollection.features.map(
      (feature) => feature.properties.kind,
    )).toEqual(['marker', 'circle', 'line', 'polygon']);
    const mapState = await getMapState(page);
    expect(mapState.center[0]).toBeCloseTo(viewport.center.lat, 5);
    expect(mapState.center[1]).toBeCloseTo(viewport.center.lng, 5);
    expect(mapState.zoom).toBe(viewport.zoom);
    expect(mapState.circles).toHaveLength(1);
  });

  test('保存済みrecordの検証失敗時は現在表示中の地図を維持する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    const record = await saveProject(page);
    await clickMap(page);
    const before = await getAppState(page);
    await page.evaluate(async ({ projectId }) => {
      const database = await JourneyMapIndexedDb.openDatabase();
      const transaction = database.transaction('mapProjects', 'readwrite');
      const store = transaction.objectStore('mapProjects');
      const request = store.get(projectId);
      const stored = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      stored.featureCollection = { type: 'Invalid', features: [] };
      store.put(stored);
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, { projectId: record.projectId });

    await page.locator('#saved-projects').selectOption(record.projectId);
    await page.locator('#open-project').click();

    await expect(page.locator('#project-state')).toHaveAttribute('data-kind', 'error');
    expect((await getAppState(page)).mapProject.featureCollection)
      .toEqual(before.mapProject.featureCollection);
  });

  test('更新保存は同じprojectIdを維持してupdatedAtを更新する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    const original = await saveProject(page);
    await page.waitForTimeout(20);
    await page.locator('#map-project-name').fill('更新後の地図');
    const updated = await saveProject(page);

    expect(updated.projectId).toBe(original.projectId);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
    expect(await page.evaluate(() => JourneyMapIndexedDb.listProjects()))
      .toHaveLength(1);
  });

  test('複製は新しいprojectIdで別recordとして保存する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    const original = await saveProject(page);
    await page.waitForTimeout(20);
    await page.locator('#duplicate-project').click();
    await expect(page.locator('#map-project-name')).toHaveValue(
      '通勤圏・優先エリア整理（複製）',
    );

    const records = await page.evaluate(() => JourneyMapIndexedDb.listProjects());
    expect(records).toHaveLength(2);
    expect(records[0].projectId).not.toBe(original.projectId);
    expect(records.map((record) => record.projectId)).toContain(original.projectId);
  });

  test('JSONバックアップを書き出す', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await seedMixedRuntime(page);
    await saveProject(page);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-project').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^HH-001_土地探し第1回_通勤圏・優先エリア整理\.mahoroba-map\.json$/,
    );
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const record = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(record.schemaVersion).toBe(1);
    expect(record.featureCollection.features).toHaveLength(4);
  });

  test('正しいJSONバックアップをIndexedDBと現在の地図へ読み込む', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    const record = backupRecord();

    await page.locator('#import-file').setInputFiles({
      name: 'backup.mahoroba-map.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(record)),
    });
    await expect(page.locator('#map-project-name')).toHaveValue('架空バックアップ');
    expect(
      (await getAppState(page)).mapProject.featureCollection.features,
    ).toHaveLength(4);
    expect(await page.evaluate(
      (projectId) => JourneyMapIndexedDb.getProject(projectId),
      PROJECT_ID,
    )).toEqual(record);
  });

  test('不正JSONを日本語エラーで拒否し現在の地図と保存領域を変更しない', async ({
    page,
  }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await clickMap(page);
    const before = await getAppState(page);
    const invalid = backupRecord({
      featureCollection: {
        type: 'FeatureCollection',
        features: [
          mixedFeatureCollection().features[0],
          mixedFeatureCollection().features[0],
        ],
      },
    });

    await page.locator('#import-file').setInputFiles({
      name: 'invalid.mahoroba-map.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(invalid)),
    });

    await expect(page.locator('#project-state')).toHaveAttribute('data-kind', 'error');
    expect((await getAppState(page)).mapProject.featureCollection)
      .toEqual(before.mapProject.featureCollection);
    expect(await page.evaluate(() => JourneyMapIndexedDb.listProjects()))
      .toEqual([]);

    await page.locator('#import-file').setInputFiles({
      name: 'broken.mahoroba-map.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{broken'),
    });
    await expect(page.locator('#project-state')).toContainText(
      'JSONファイルを読み取れませんでした',
    );
    expect((await getAppState(page)).mapProject.featureCollection)
      .toEqual(before.mapProject.featureCollection);
  });

  test('import適用中の失敗をrollbackしIndexedDBへ保存しない', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await clickMap(page);
    const before = await getAppState(page);
    const beforeMetadata = await page.locator('#map-project-name').inputValue();
    await page.evaluate(() => {
      const originalRenderList = renderList;
      window.renderList = () => {
        window.renderList = originalRenderList;
        throw new Error('synthetic import render failure');
      };
    });
    page.once('dialog', (dialog) => dialog.accept());

    await page.locator('#import-file').setInputFiles({
      name: 'rollback.mahoroba-map.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backupRecord())),
    });

    await expect(page.locator('#project-state')).toContainText(
      'synthetic import render failure',
    );
    expect((await getAppState(page)).mapProject.featureCollection)
      .toEqual(before.mapProject.featureCollection);
    await expect(page.locator('#map-project-name')).toHaveValue(beforeMetadata);
    expect(await page.evaluate(() => JourneyMapIndexedDb.listProjects()))
      .toEqual([]);
  });

  test('localStorageとsessionStorageを使用しない', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await clickMap(page);
    await saveProject(page);

    expect(await page.evaluate(() => ({
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    }))).toEqual({ localStorage: 0, sessionStorage: 0 });
  });

  for (const viewport of [
    { name: 'PC', width: 1440, height: 900 },
    { name: '360px', width: 360, height: 800 },
  ]) {
    test(`${viewport.name}表示で保存操作がviewport内に収まる`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openMap(page);
      await waitForProjectManager(page);
      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        panelWidth: document.getElementById('panel').getBoundingClientRect().width,
        saveButtonWidth: document.getElementById('save-project').getBoundingClientRect().width,
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(metrics.panelWidth).toBeLessThanOrEqual(viewport.width);
      expect(metrics.saveButtonWidth).toBeGreaterThan(0);
    });
  }

  test('保存・一覧・日本語toolbarでconsole errorとpage errorを発生させない', async ({
    page,
  }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openMap(page);
    await waitForProjectManager(page);
    await clickMap(page);
    await saveProject(page);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
