const { test, expect } = require('@playwright/test');
const {
  clickMap,
  getMapState,
  openMap,
} = require('./support/map-test-helpers');

async function addCircle(page, label, xRatio = 0.5) {
  await page.locator('#label-input').fill(label);
  await clickMap(page, xRatio, 0.5);
}

test.describe('円操作', () => {
  test('円へズームしてから個別削除できる', async ({ page }) => {
    await openMap(page);
    await addCircle(page, '架空地点A');

    const initialZoom = (await getMapState(page)).zoom;
    await page.getByTitle('この円にズーム').click();
    await expect.poll(async () => (await getMapState(page)).zoom).toBeGreaterThan(initialZoom);

    await page.locator('.circle-item').getByTitle('削除', { exact: true }).click();
    expect((await getMapState(page)).circles).toEqual([]);
    await expect(page.locator('#circle-list')).toContainText('まだ円がありません');
  });

  test('全削除1回目は警告し、2回目で削除する', async ({ page }) => {
    await openMap(page);
    await addCircle(page, '架空地点A', 0.45);
    await addCircle(page, '架空地点B', 0.55);

    const clearButton = page.locator('#clear-all');
    await clearButton.click();
    await expect(clearButton).toHaveText('本当に削除？もう一度クリック（2個）');
    expect((await getMapState(page)).circles).toHaveLength(2);

    await clearButton.click();
    expect((await getMapState(page)).circles).toEqual([]);
    await expect(clearButton).toHaveText('すべての円を削除');
  });

  test('全削除の警告は3秒経過後に取り消される', async ({ page }) => {
    await openMap(page);
    await addCircle(page, '架空地点A');

    const clearButton = page.locator('#clear-all');
    await clearButton.click();
    await expect(clearButton).toContainText('本当に削除？');
    await page.waitForTimeout(3_200);

    await expect(clearButton).toHaveText('すべての円を削除');
    expect((await getMapState(page)).circles).toHaveLength(1);
  });
});

const viewports = [
  { height: 900, name: 'pc-1440x900', width: 1440 },
  { height: 720, name: 'pc-1280x720', width: 1280 },
  { height: 844, name: 'mobile-390x844', width: 390 },
  { height: 800, name: 'mobile-360x800', width: 360 },
];

test.describe('Responsive baseline', () => {
  for (const viewport of viewports) {
    test(`${viewport.name}のレイアウトを記録する`, async ({ page }, testInfo) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openMap(page);

      const metrics = await page.evaluate(() => {
        const panel = document.querySelector('#panel').getBoundingClientRect();
        const mapElement = document.querySelector('#map').getBoundingClientRect();
        return {
          documentWidth: document.documentElement.scrollWidth,
          map: {
            height: mapElement.height,
            width: mapElement.width,
          },
          panel: {
            height: panel.height,
            width: panel.width,
          },
          viewport: {
            height: innerHeight,
            width: innerWidth,
          },
        };
      });

      expect(metrics.documentWidth).toBeLessThanOrEqual(viewport.width);

      if (viewport.width <= 768) {
        expect(metrics.panel.width).toBe(viewport.width);
        expect(metrics.map.width).toBe(viewport.width);
        expect(metrics.panel.height).toBeCloseTo(viewport.height / 2, 0);
        expect(metrics.map.height).toBeCloseTo(viewport.height / 2, 0);
      } else {
        expect(metrics.panel.width).toBe(360);
        expect(metrics.panel.height).toBe(viewport.height);
        expect(metrics.map.width).toBe(viewport.width - 360);
        expect(metrics.map.height).toBe(viewport.height);
      }

      const screenshotPath = testInfo.outputPath(`${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath });
      await testInfo.attach(viewport.name, {
        path: screenshotPath,
        contentType: 'image/png',
      });
    });
  }
});
