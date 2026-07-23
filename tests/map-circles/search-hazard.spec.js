const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const {
  fixturePath,
  getMapState,
  openMap,
} = require('./support/map-test-helpers');

const nominatimSuccess = fs.readFileSync(
  fixturePath('nominatim-success.json'),
  'utf8',
);
const nominatimEmpty = fs.readFileSync(
  fixturePath('nominatim-empty.json'),
  'utf8',
);

test.describe('Nominatim検索mock', () => {
  test('成功時に検索結果へ移動し円を追加する現行挙動を固定する', async ({ page }) => {
    const audit = await openMap(page, {
      nominatimResponse: {
        body: nominatimSuccess,
        status: 200,
      },
    });

    await page.locator('#search-input').fill('架空中央駅');
    await page.locator('#search-btn').click();

    await expect(page.locator('#count-badge')).toHaveText('（1）');
    await expect(page.locator('.circle-item .label-text')).toHaveText('架空中央駅');

    const state = await getMapState(page);
    expect(state.center[0]).toBeCloseTo(35, 4);
    expect(state.center[1]).toBeCloseTo(137, 4);
    expect(state.zoom).toBe(15);
    expect(state.circles[0]).toMatchObject({
      center: [35, 137],
      label: '架空中央駅',
      radius: 800,
    });

    expect(audit.nominatimRequests).toHaveLength(1);
    const requestUrl = new URL(audit.nominatimRequests[0]);
    expect(requestUrl.searchParams.get('q')).toBe('架空中央駅');
    expect(requestUrl.searchParams.get('countrycodes')).toBe('jp');
    expect(requestUrl.searchParams.get('limit')).toBe('1');
    expect(audit.unexpectedExternal).toEqual([]);
  });

  test('0件では円を追加しない', async ({ page }) => {
    const audit = await openMap(page, {
      nominatimResponse: {
        body: nominatimEmpty,
        status: 200,
      },
    });

    await page.locator('#search-input').fill('架空未登録地点');
    await page.locator('#search-btn').click();

    await expect(page.locator('#status')).toHaveText(
      '見つかりませんでした。地名・駅名・住所を試してください',
    );
    expect((await getMapState(page)).circles).toEqual([]);
    expect(audit.nominatimRequests).toHaveLength(1);
    expect(audit.unexpectedExternal).toEqual([]);
  });

  test('HTTP errorを表示し、検索語をconsoleへ出力しない', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (message) => consoleMessages.push(message.text()));

    const audit = await openMap(page, {
      nominatimResponse: {
        body: JSON.stringify({ error: 'synthetic failure' }),
        status: 503,
      },
    });

    const query = '架空障害試験地点';
    await page.locator('#search-input').fill(query);
    await page.locator('#search-btn').click();

    await expect(page.locator('#status')).toContainText('検索エラー');
    expect((await getMapState(page)).circles).toEqual([]);
    expect(consoleMessages.some((message) => message.includes('Search error:'))).toBe(true);
    expect(consoleMessages.join('\n')).not.toContain(query);
    expect(audit.nominatimRequests).toHaveLength(1);
    expect(audit.unexpectedExternal).toEqual([]);
  });
});
test.describe('ハザードレイヤーmock', () => {
  test('4種類を個別にON/OFFできる', async ({ page }) => {
    const audit = await openMap(page);
    const keys = ['flood', 'landslide', 'hightide', 'tsunami'];

    for (const key of keys) {
      const checkbox = page.locator(`input[data-hazard="${key}"]`);
      await checkbox.check();

      expect(
        await page.evaluate((hazardKey) => ({
          active: map.hasLayer(hazardLayers[hazardKey]),
          exists: Boolean(hazardLayers[hazardKey]),
        }), key),
      ).toEqual({ active: true, exists: true });

      await checkbox.uncheck();
      expect(
        await page.evaluate(
          (hazardKey) => map.hasLayer(hazardLayers[hazardKey]),
          key,
        ),
      ).toBe(false);
    }

    expect(audit.tileRequests.some((url) => url.includes('disaportaldata.gsi.go.jp'))).toBe(true);
    expect(audit.unexpectedExternal).toEqual([]);
  });

  test('複数レイヤーと透明度を反映する', async ({ page }) => {
    const audit = await openMap(page);

    await page.locator('input[data-hazard="flood"]').check();
    await page.locator('input[data-hazard="tsunami"]').check();
    await page.locator('#hazard-opacity').evaluate((element) => {
      element.value = '35';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect(page.locator('#hazard-opacity-val')).toHaveText('35%');
    expect(
      await page.evaluate(() => ({
        flood: {
          active: map.hasLayer(hazardLayers.flood),
          opacity: hazardLayers.flood.options.opacity,
        },
        tsunami: {
          active: map.hasLayer(hazardLayers.tsunami),
          opacity: hazardLayers.tsunami.options.opacity,
        },
      })),
    ).toEqual({
      flood: { active: true, opacity: 0.35 },
      tsunami: { active: true, opacity: 0.35 },
    });

    expect(audit.unexpectedExternal).toEqual([]);
  });
});
