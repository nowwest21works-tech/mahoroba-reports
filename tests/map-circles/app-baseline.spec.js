const { test, expect } = require('@playwright/test');
const {
  clickMap,
  getMapState,
  openMap,
} = require('./support/map-test-helpers');

test.describe('初期表示', () => {
  test('title、初期中心、zoom、パネル、OSM attributionを表示する', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const audit = await openMap(page);

    await expect(page).toHaveTitle('まほろば｜マップ円描画ツール');
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
    await expect(
      page.locator('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'),
    ).toBeVisible();

    const state = await getMapState(page);
    expect(state.center[0]).toBeCloseTo(35.1709, 4);
    expect(state.center[1]).toBeCloseTo(136.8815, 4);
    expect(state.zoom).toBe(14);
    expect(state.circles).toEqual([]);
    expect(audit.unexpectedExternal).toEqual([]);
  });
});
test.describe('円追加', () => {
  test('地図クリックで既定半径、色、ラベル、件数を反映する', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page);

    await page.locator('#label-input').fill('架空地点A');
    await clickMap(page);

    const state = await getMapState(page);
    expect(state.circles).toHaveLength(1);
    expect(state.circles[0]).toMatchObject({
      color: '#c8443a',
      label: '架空地点A',
      radius: 800,
    });
    await expect(page.locator('#count-badge')).toHaveText('（1）');
    await expect(page.locator('.circle-item .label-text')).toHaveText('架空地点A');
    await expect(page.locator('.circle-item .meta')).toContainText('半径 800m');
    await expect(page.locator('.circle-label')).toContainText('架空地点A · 800m');
  });

  const presets = [
    [500, '500m'],
    [800, '800m'],
    [1000, '1km'],
    [2000, '2km'],
    [3000, '3km'],
    [5000, '5km'],
  ];

  for (const [radius, label] of presets) {
    test(`半径preset ${label}を円へ反映する`, async ({ page }) => {
      await openMap(page);
      await page.locator(`.preset-btn[data-radius="${radius}"]`).click();
      await clickMap(page);

      const state = await getMapState(page);
      expect(state.circles).toHaveLength(1);
      expect(state.circles[0].radius).toBe(radius);
    });
  }

  test('カスタム半径の下限50mと上限50,000mを受け付ける', async ({ page }) => {
    await openMap(page);

    await page.locator('#custom-radius').fill('50');
    await page.locator('#apply-custom').click();
    await clickMap(page, 0.4, 0.5);

    await page.locator('#custom-radius').fill('50000');
    await page.locator('#apply-custom').click();
    await clickMap(page, 0.6, 0.5);

    const state = await getMapState(page);
    expect(state.circles.map((circle) => circle.radius)).toEqual([50, 50000]);
  });

  const invalidValues = [
    ['49', false],
    ['50001', false],
    ['abc', true],
  ];

  for (const [value, requiresTextType] of invalidValues) {
    test(`範囲外・不正入力 ${value} を拒否し既定半径を維持する`, async ({ page }) => {
      await openMap(page);
      const input = page.locator('#custom-radius');

      if (requiresTextType) {
        await input.evaluate((element) => {
          element.type = 'text';
        });
      }

      await input.fill(value);
      await page.locator('#apply-custom').click();
      await expect(page.locator('#status')).toHaveText('50〜50000mの範囲で入力してください');

      await clickMap(page);
      const state = await getMapState(page);
      expect(state.circles[0].radius).toBe(800);
    });
  }
});

test.describe('セキュリティと保存なしbaseline', () => {
  test('HTMLを含むラベルをtextとして表示し実行しない', async ({ page }) => {
    await page.addInitScript(() => {
      window.__mapCirclesXssExecuted = false;
    });
    await openMap(page);

    const label = '<img src=x onerror="window.__mapCirclesXssExecuted=true">';
    await page.locator('#label-input').fill(label);
    await clickMap(page);

    await expect(page.locator('.circle-label')).toContainText(label);
    await expect(page.locator('.circle-label img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__mapCirclesXssExecuted)).toBe(false);
  });

  test('reload後に円が消え、Web Storageへ保存しない', async ({ page }) => {
    await openMap(page);
    await clickMap(page);
    await expect(page.locator('#count-badge')).toHaveText('（1）');

    await page.reload();
    await page.locator('#map.leaflet-container').waitFor();

    const state = await getMapState(page);
    expect(state.circles).toEqual([]);
    await expect(page.locator('#circle-list')).toContainText('まだ円がありません');
    expect(
      await page.evaluate(() => ({
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
      })),
    ).toEqual({
      localStorage: 0,
      sessionStorage: 0,
    });
  });
});
