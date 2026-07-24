const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const {
  clickMap,
  fixturePath,
  getAppState,
  getMapState,
  openMap,
} = require('./support/map-test-helpers');

const nominatimSuccess = fs.readFileSync(
  fixturePath('nominatim-success.json'),
  'utf8',
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getTransactionState(page) {
  return page.evaluate(() => ({
    snapshot: MapCirclesAppState.getSnapshot(),
    mapProject: MapCirclesAppState.getCurrentMapProject(),
    circles: circles.map((item) => ({
      id: item.id,
      featureId: item.featureId,
      center: item.center,
      radius: item.radius,
      color: item.color,
      label: item.label,
    })),
    leafletLayers: {
      circles: circles.filter((item) => map.hasLayer(item.circle)).length,
      markers: circles.filter((item) => map.hasLayer(item.marker)).length,
    },
    listDom: {
      badgeText: document.getElementById('count-badge').textContent,
      listHtml: document.getElementById('circle-list').innerHTML,
    },
    nextId,
  }));
}

test.describe('GeoJSON runtime同期', () => {
  test('初期状態は匿名relation各1件と空FeatureCollectionを持つ', async ({ page }) => {
    await openMap(page);
    const state = await getAppState(page);

    expect(state.snapshot.households).toHaveLength(1);
    expect(state.snapshot.journeys).toHaveLength(1);
    expect(state.snapshot.mapProjects).toHaveLength(1);
    expect(Object.keys(state.snapshot.households[0]).sort()).toEqual([
      'createdAt',
      'displayCode',
      'id',
      'schemaVersion',
      'updatedAt',
    ]);
    expect(state.snapshot.households[0].displayCode).toBe('HH-001');
    expect(state.snapshot.journeys[0]).toMatchObject({
      serviceType: 'land_purchase',
      displayLabel: '検討1',
      status: 'active',
    });
    expect(state.mapProject.displayLabel).toBe('条件整理マップ1');
    expect(state.mapProject.featureCollection).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
    expect(
      await page.evaluate(() => ({
        frozen: Object.isFrozen(MapCirclesAppState),
        keys: Object.keys(MapCirclesAppState).sort(),
        globals: {
          addCircle: typeof window.addCircle,
          clearAllCircles: typeof window.clearAllCircles,
          getCurrentMapProject: typeof window.getCurrentMapProject,
          mapCirclesStore: typeof window.mapCirclesStore,
          removeCircle: typeof window.removeCircle,
          runtimeHousehold: typeof window.runtimeHousehold,
          runtimeJourney: typeof window.runtimeJourney,
          runtimeMapProject: typeof window.runtimeMapProject,
          updateCurrentFeatureCollection:
            typeof window.updateCurrentFeatureCollection,
          zoomToCircle: typeof window.zoomToCircle,
        },
        privateBindings: {
          clearAllCircles: typeof clearAllCircles,
          getCurrentMapProject: typeof getCurrentMapProject,
          mapCirclesStore: typeof mapCirclesStore,
          runtimeHousehold: typeof runtimeHousehold,
          runtimeJourney: typeof runtimeJourney,
          runtimeMapProject: typeof runtimeMapProject,
          updateCurrentFeatureCollection:
            typeof updateCurrentFeatureCollection,
        },
      })),
    ).toEqual({
      frozen: true,
      keys: ['getCurrentMapProject', 'getSnapshot'],
      globals: {
        addCircle: 'function',
        clearAllCircles: 'undefined',
        getCurrentMapProject: 'undefined',
        mapCirclesStore: 'undefined',
        removeCircle: 'function',
        runtimeHousehold: 'undefined',
        runtimeJourney: 'undefined',
        runtimeMapProject: 'undefined',
        updateCurrentFeatureCollection: 'undefined',
        zoomToCircle: 'function',
      },
      privateBindings: {
        clearAllCircles: 'undefined',
        getCurrentMapProject: 'undefined',
        mapCirclesStore: 'undefined',
        runtimeHousehold: 'undefined',
        runtimeJourney: 'undefined',
        runtimeMapProject: 'undefined',
        updateCurrentFeatureCollection: 'undefined',
      },
    });

    state.mapProject.featureCollection.features.push({ invalid: true });
    expect((await getAppState(page)).mapProject.featureCollection.features).toEqual([]);
  });

  test('地図クリックで円とCircle Featureを同じ値で追加する', async ({ page }) => {
    await openMap(page);
    await page.locator('#label-input').fill('架空地点A');
    await clickMap(page);

    const mapState = await getMapState(page);
    const appState = await getAppState(page);
    const circle = mapState.circles[0];
    const feature = appState.mapProject.featureCollection.features[0];

    expect(mapState.circles).toHaveLength(1);
    expect(appState.mapProject.featureCollection.features).toHaveLength(1);
    expect(feature.id).toBe(circle.featureId);
    expect(feature.id).toMatch(UUID_PATTERN);
    expect(feature.geometry).toEqual({
      type: 'Point',
      coordinates: [circle.center[1], circle.center[0]],
    });
    expect(feature.properties).toEqual({
      schemaVersion: 1,
      kind: 'circle',
      radiusMeters: circle.radius,
      color: circle.color,
      label: circle.label,
    });
  });

  test('Nominatim検索成功でも検索語labelの円とFeatureを追加する', async ({ page }) => {
    await openMap(page, {
      nominatimResponse: {
        body: nominatimSuccess,
        status: 200,
      },
    });
    await page.locator('#search-input').fill('架空中央駅');
    await page.locator('#search-btn').click();

    await expect.poll(
      async () => (await getMapState(page)).circles.length,
    ).toBe(1);
    await expect.poll(
      async () => (
        await getAppState(page)
      ).mapProject.featureCollection.features.length,
    ).toBe(1);

    const mapState = await getMapState(page);
    const feature = (await getAppState(page)).mapProject.featureCollection.features[0];
    expect(mapState.circles).toHaveLength(1);
    expect(feature.geometry.coordinates).toEqual([137, 35]);
    expect(feature.properties).toMatchObject({
      radiusMeters: 800,
      color: '#c8443a',
      label: '架空中央駅',
    });
  });

  test('個別削除でLeaflet、circles、Featureを同時に削除する', async ({ page }) => {
    await openMap(page);
    await clickMap(page);
    await page.getByTitle('削除').click();

    expect((await getMapState(page)).circles).toEqual([]);
    expect(
      (await getAppState(page)).mapProject.featureCollection.features,
    ).toEqual([]);
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
    await expect(page.locator('.leaflet-marker-pane .circle-label')).toHaveCount(0);
  });

  test('全削除でLeaflet、circles、FeatureCollectionを空にする', async ({ page }) => {
    await openMap(page);
    await clickMap(page, 0.45, 0.5);
    await clickMap(page, 0.55, 0.5);

    const clearButton = page.locator('#clear-all');
    await clearButton.click();
    await clearButton.click();

    expect((await getMapState(page)).circles).toEqual([]);
    expect(
      (await getAppState(page)).mapProject.featureCollection.features,
    ).toEqual([]);
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
    await expect(page.locator('.leaflet-marker-pane .circle-label')).toHaveCount(0);
  });

  test('不正円は事前validationしUIとFeatureCollectionを変更しない', async ({ page }) => {
    await openMap(page);
    const message = await page.evaluate(() => {
      try {
        addCircle(35.1709, 136.8815, 49, '#c8443a', '無効円');
        return null;
      } catch (error) {
        return error.message;
      }
    });

    expect(message).toContain('radiusMeters');
    expect((await getMapState(page)).circles).toEqual([]);
    expect(
      (await getAppState(page)).mapProject.featureCollection.features,
    ).toEqual([]);
  });

  test('円追加中のrenderList失敗はsnapshotとUIを完全にロールバックする', async ({
    page,
  }) => {
    await openMap(page);
    const before = await getTransactionState(page);

    const errorMessage = await page.evaluate(() => {
      const originalRenderList = window.renderList;
      window.renderList = () => {
        window.renderList = originalRenderList;
        throw new Error('synthetic render failure');
      };

      try {
        window.addCircle(
          35.170915,
          136.881537,
          1200,
          '#3366FF',
          'ロールバック確認',
        );
        return null;
      } catch (error) {
        return error.message;
      }
    });

    expect(errorMessage).toBe('synthetic render failure');
    const after = await getTransactionState(page);

    expect(after).toEqual(before);
    expect(after.mapProject.updatedAt).toBe(before.mapProject.updatedAt);
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(0);
    await expect(page.locator('.leaflet-marker-pane .circle-label')).toHaveCount(0);
    await expect(page.locator('.circle-item')).toHaveCount(0);
  });

  test('個別削除中のrenderList失敗はsnapshotとUIを完全にロールバックする', async ({
    page,
  }) => {
    await openMap(page);
    await clickMap(page);
    const before = await getTransactionState(page);

    const errorMessage = await page.evaluate(() => {
      const originalRenderList = window.renderList;
      window.renderList = () => {
        window.renderList = originalRenderList;
        throw new Error('synthetic remove render failure');
      };

      try {
        window.removeCircle(circles[0].id);
        return null;
      } catch (error) {
        return error.message;
      }
    });

    expect(errorMessage).toBe('synthetic remove render failure');
    const after = await getTransactionState(page);

    expect(after).toEqual(before);
    expect(after.mapProject.updatedAt).toBe(before.mapProject.updatedAt);
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(1);
    await expect(page.locator('.leaflet-marker-pane .circle-label')).toHaveCount(1);
    await expect(page.locator('.circle-item')).toHaveCount(1);
  });

  test('全削除中のrenderList失敗はsnapshotとUIを完全にロールバックする', async ({
    page,
  }) => {
    await openMap(page);
    await clickMap(page, 0.45, 0.5);
    await clickMap(page, 0.55, 0.5);

    const clearButton = page.locator('#clear-all');
    await clearButton.click();
    const before = await getTransactionState(page);
    await page.evaluate(() => {
      const originalRenderList = window.renderList;
      window.renderList = () => {
        window.renderList = originalRenderList;
        throw new Error('synthetic clear render failure');
      };
    });

    const pageErrorPromise = page.waitForEvent('pageerror');
    await clearButton.click();
    const pageError = await pageErrorPromise;
    expect(pageError.message).toBe('synthetic clear render failure');

    const after = await getTransactionState(page);
    expect(after).toEqual(before);
    expect(after.mapProject.updatedAt).toBe(before.mapProject.updatedAt);
    await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
    await expect(page.locator('.leaflet-marker-pane .circle-label')).toHaveCount(2);
    await expect(page.locator('.circle-item')).toHaveCount(2);
  });

  test('reload後は円とFeatureCollectionが消えWeb Storageを使用しない', async ({ page }) => {
    await openMap(page);
    await clickMap(page);
    expect(
      (await getAppState(page)).mapProject.featureCollection.features,
    ).toHaveLength(1);

    await page.reload();
    await page.locator('#map.leaflet-container').waitFor();

    expect((await getMapState(page)).circles).toEqual([]);
    expect(
      (await getAppState(page)).mapProject.featureCollection.features,
    ).toEqual([]);
    expect(
      await page.evaluate(() => ({
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
      })),
    ).toEqual({ localStorage: 0, sessionStorage: 0 });
  });
});
