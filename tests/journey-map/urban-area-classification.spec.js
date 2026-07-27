const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  clickMap,
  fixturePath,
  getMapState,
  openMap,
} = require('./support/map-test-helpers');

const DATA_FIXTURE = fixturePath('urban-area-classification.geojson');
const SCREENSHOT_ROOT = path.resolve(
  __dirname,
  '../../docs/screenshots',
);

test.describe('区域区分レイヤー', () => {
  test('初期OFFからON／OFFでき、凡例・分類style・出典を表示する', async ({ page }) => {
    const audit = await openMap(page, { urbanAreaFixture: DATA_FIXTURE });
    const toggle = page.locator('#urban-area-classification-toggle');
    const legend = page.locator('#urban-area-classification-legend');

    await expect(toggle).not.toBeChecked();
    await expect(legend).toBeHidden();
    expect(audit.urbanAreaRequests).toEqual([]);

    await toggle.check();
    await expect(page.locator('#urban-area-classification-state'))
      .toHaveText('市街化区域・市街化調整区域：ON（2区画）');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('市街化区域');
    await expect(legend).toContainText('市街化調整区域');
    await expect(legend).not.toContainText('非線引き都市計画区域');
    await expect(page.locator('.leaflet-urban-area-classification-pane path')).toHaveCount(2);
    const renderedClassifications = await page.evaluate(() =>
      UrbanAreaClassificationLayer.getLayer().getLayers()
        .map((item) => item.feature.properties.classificationCode));
    expect(renderedClassifications).toEqual([
      'urbanization-promotion-area',
      'urbanization-control-area',
    ]);
    expect(audit.urbanAreaRequests).toHaveLength(1);

    const styles = await page.locator('.leaflet-urban-area-classification-pane path')
      .evaluateAll((paths) => paths.map((path) => ({
        fill: path.getAttribute('fill'),
        fillOpacity: path.getAttribute('fill-opacity'),
        stroke: path.getAttribute('stroke'),
        dashArray: path.getAttribute('stroke-dasharray'),
      })));
    expect(new Set(styles.map((style) => style.fill)).size).toBe(2);
    expect(styles.every((style) => Number(style.fillOpacity) <= 0.3)).toBe(true);
    expect(styles.some((style) => style.dashArray)).toBe(true);

    await toggle.uncheck();
    await expect(legend).toBeHidden();
    await expect(page.locator('.leaflet-urban-area-classification-pane path')).toHaveCount(0);
  });

  test('polygon選択で日本語属性を安全に表示し地図clickへ伝播しない', async ({ page }) => {
    await openMap(page, { urbanAreaFixture: DATA_FIXTURE });
    await page.locator('#urban-area-classification-toggle').check();
    await expect(page.locator('.leaflet-urban-area-classification-pane path')).toHaveCount(2);
    const before = await getMapState(page);

    await page.locator(
      '.leaflet-urban-area-classification-pane path[fill="#e85d83"]',
    ).click({
      position: { x: 8, y: 8 },
    });
    const popup = page.locator('.urban-area-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('市街化区域');
    await expect(popup).toContainText('架空中央都市計画区域');
    await expect(popup).toContainText('愛知県架空中央市');
    await expect(popup).toContainText('令和7年度');
    await expect(popup).toContainText('国土交通省 不動産情報ライブラリ');
    await expect(popup).toContainText('正式な区域は各自治体の担当窓口で確認');
    expect((await getMapState(page)).circles).toEqual(before.circles);
  });

  test('表示中もpan・zoom、円追加、地図メモ配置を利用できる', async ({ page }) => {
    await openMap(page, { urbanAreaFixture: DATA_FIXTURE });
    await page.locator('#urban-area-classification-toggle').check();
    await expect(page.locator('#urban-area-classification-legend')).toBeVisible();

    const beforeView = await getMapState(page);
    await page.evaluate(() => {
      map.panBy([80, 0], { animate: false });
      map.setZoom(map.getZoom() + 1, { animate: false });
    });
    await expect.poll(async () => (await getMapState(page)).zoom).toBe(beforeView.zoom + 1);
    expect((await getMapState(page)).center).not.toEqual(beforeView.center);

    await clickMap(page, 0.9, 0.85);
    await expect.poll(async () => (await getMapState(page)).circles.length).toBe(1);

    await page.locator('#map-note-input').fill('区域レイヤー確認用の架空メモ');
    await page.locator('#place-map-note').click();
    await clickMap(page, 0.8, 0.7);
    await expect(page.locator('.map-note-content')).toHaveText('区域レイヤー確認用の架空メモ');
    await expect(page.locator('#urban-area-classification-legend')).toBeVisible();
  });

  test('製品GeoJSON未配置時はdummy表示せず安全にOFFへ戻る', async ({ page }) => {
    await openMap(page, { urbanAreaFailure: 404 });
    const toggle = page.locator('#urban-area-classification-toggle');
    await toggle.check();
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('#urban-area-classification-legend')).toBeHidden();
    await expect(page.locator('#urban-area-classification-state'))
      .toContainText('区域区分データを取得できませんでした (404)');
    await expect(page.locator('.leaflet-urban-area-classification-pane path')).toHaveCount(0);
  });

  test('360px幅でも凡例が地図内に収まり操作を覆いすぎない', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openMap(page, { urbanAreaFixture: DATA_FIXTURE });
    await page.locator('#urban-area-classification-toggle').check();
    const legend = page.locator('#urban-area-classification-legend');
    await expect(legend).toBeVisible();
    const box = await legend.boundingBox();
    const mapBox = await page.locator('#map').boundingBox();
    expect(box).not.toBeNull();
    expect(mapBox).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(mapBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(mapBox.x + mapBox.width);
    expect(box.height).toBeLessThan(mapBox.height * 0.6);
  });

  test('review用のdesktop screenshotを生成する', async ({ page }) => {
    test.skip(!process.env.UPDATE_URBAN_AREA_SCREENSHOTS);
    fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page, { urbanAreaFixture: DATA_FIXTURE });
    const toggle = page.locator('#urban-area-classification-toggle');
    await toggle.scrollIntoViewIfNeeded();
    await toggle.check();
    await page.locator(
      '.leaflet-urban-area-classification-pane path[fill="#e85d83"]',
    ).click({ position: { x: 8, y: 8 } });
    await expect(page.locator('.urban-area-popup')).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_ROOT, 'urban-area-classification-desktop.png'),
    });
  });

  test('review用のmobile screenshotを生成する', async ({ page }) => {
    test.skip(!process.env.UPDATE_URBAN_AREA_SCREENSHOTS);
    fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true });
    await page.setViewportSize({ width: 360, height: 800 });
    await openMap(page, { urbanAreaFixture: DATA_FIXTURE });
    const toggle = page.locator('#urban-area-classification-toggle');
    await toggle.scrollIntoViewIfNeeded();
    await toggle.check();
    await expect(page.locator('#urban-area-classification-legend')).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_ROOT, 'urban-area-classification-mobile.png'),
    });
  });
});
