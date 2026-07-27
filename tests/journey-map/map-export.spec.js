const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const {
  APP_PATH,
  openMap,
} = require('./support/map-test-helpers');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function exportFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        properties: {
          schemaVersion: 1,
          kind: 'circle',
          label: '名古屋駅 800m',
          radiusMeters: 800,
          color: '#c8443a',
        },
        geometry: { type: 'Point', coordinates: [136.8815, 35.1709] },
      },
      {
        type: 'Feature',
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        properties: {
          schemaVersion: 1,
          kind: 'circle',
          label: '候補地 1km',
          radiusMeters: 1000,
          color: '#3a8c5f',
        },
        geometry: { type: 'Point', coordinates: [136.8915, 35.177] },
      },
      {
        type: 'Feature',
        id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
        properties: {
          schemaVersion: 1,
          kind: 'marker',
          label: '駅徒歩圏の候補\n交通量と騒音を現地確認',
        },
        geometry: { type: 'Point', coordinates: [136.885, 35.172] },
      },
      {
        type: 'Feature',
        id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
        properties: {
          schemaVersion: 1,
          kind: 'marker',
          label: '<img src=x onerror=window.__mapExportXss=true>',
        },
        geometry: { type: 'Point', coordinates: [136.878, 35.168] },
      },
      {
        type: 'Feature',
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5',
        properties: {
          schemaVersion: 1,
          kind: 'line',
          label: '検討路線',
          color: '#2c3e50',
        },
        geometry: {
          type: 'LineString',
          coordinates: [[136.872, 35.166], [136.892, 35.178]],
        },
      },
      {
        type: 'Feature',
        id: 'ffffffff-ffff-4fff-8fff-fffffffffff6',
        properties: {
          schemaVersion: 1,
          kind: 'polygon',
          label: '優先範囲',
          color: '#7a4e9c',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [136.874, 35.166],
            [136.882, 35.166],
            [136.882, 35.171],
            [136.874, 35.166],
          ]],
        },
      },
    ],
  };
}

async function loadExportScenario(page) {
  await page.evaluate((featureCollection) => {
    window.__mapExportXss = false;
    MapCirclesAppState.replaceProjectState(featureCollection, {
      center: { lat: 35.1709, lng: 136.8815 },
      zoom: 14,
    });
    document.querySelector('#household-code').value = 'HH:EXPORT/01';
    document.querySelector('#journey-name').value = '土地 探し*最終';
    document.querySelector('#map-project-name').value =
      '名古屋駅<優先>|エリア?'.repeat(5);
  }, exportFeatureCollection());
  await expect(page.locator('.map-note-content')).toHaveCount(2);
}

async function injectFailedBaseTile(page, variant) {
  await page.evaluate(async (tileVariant) => {
    const layer = Array.from(Object.values(map._layers)).find(
      (candidate) => candidate.options?.exportRole === 'base',
    );
    if (layer.isLoading()) {
      await new Promise((resolve) => layer.once('load', resolve));
    }
    const currentLevel = layer._levels[layer._tileZoom].el;
    const staleLevel = document.createElement('div');
    staleLevel.className = 'leaflet-tile-container';
    const parent = tileVariant === 'old-zoom' ? staleLevel : currentLevel;
    if (tileVariant === 'old-zoom') layer._container.append(staleLevel);

    const tile = document.createElement('img');
    tile.className = 'leaflet-tile';
    tile.src = 'data:,';
    tile.style.width = '256px';
    tile.style.height = '256px';
    tile.style.transform = tileVariant === 'offscreen'
      ? 'translate3d(-10000px, -10000px, 0)'
      : 'translate3d(256px, 256px, 0)';
    if (tileVariant === 'display-none') tile.style.display = 'none';
    if (tileVariant === 'visibility-hidden') tile.style.visibility = 'hidden';
    if (tileVariant === 'opacity-zero') tile.style.opacity = '0';
    parent.append(tile);
    await new Promise((resolve) => {
      if (tile.complete) resolve();
      else tile.addEventListener('error', resolve, { once: true });
    });
    const key = `regression-${tileVariant}`;
    layer._tiles[key] = {
      coords: { x: 0, y: 0, z: layer._tileZoom },
      current: true,
      el: tile,
    };
  }, variant);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.__lastMapExportBlob = blob;
      return originalCreateObjectURL(blob);
    };
  });
});

test.describe('PNG画像書き出し', () => {
  test('実downloadは安全なファイル名、PNG MIME・signature・画面以上の寸法を持つ', async ({
    page,
  }) => {
    const audit = await openMap(page);
    await loadExportScenario(page);
    const mapBox = await page.locator('#map').boundingBox();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-map-png').click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const content = fs.readFileSync(filePath);
    const blob = await page.evaluate(async () => ({
      bytes: Array.from(
        new Uint8Array(await window.__lastMapExportBlob.slice(0, 8).arrayBuffer()),
      ),
      size: window.__lastMapExportBlob.size,
      type: window.__lastMapExportBlob.type,
    }));
    const call = await page.evaluate(() => window.__html2canvasCalls[0]);

    expect(audit.html2canvasRequests).toHaveLength(1);
    expect(download.suggestedFilename()).toMatch(
      /^mahoroba-map_HH_EXPORT_01_土地_探し_最終_[^<>:"/\\|?*]+_\d{8}-\d{4}\.png$/,
    );
    expect(download.suggestedFilename().length).toBeLessThanOrEqual(180);
    expect(content.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(blob.type).toBe('image/png');
    expect(blob.bytes).toEqual(Array.from(PNG_SIGNATURE));
    expect(blob.size).toBeGreaterThan(100);
    expect(call.elementId).toBe('map');
    expect(call.options).toMatchObject({
      allowTaint: false,
      backgroundColor: '#e8e4dc',
      logging: false,
      useCORS: true,
    });
    expect(call.options.scale).toBeGreaterThanOrEqual(1);
    expect(call.featureKinds.sort()).toEqual([
      'circle',
      'circle',
      'line',
      'marker',
      'marker',
      'polygon',
    ]);
    expect(call.noteTexts).toContain('駅徒歩圏の候補\n交通量と騒音を現地確認');
    expect(Math.round(mapBox.width * call.options.scale)).toBeGreaterThanOrEqual(
      Math.round(mapBox.width),
    );
    expect(Math.round(mapBox.height * call.options.scale)).toBeGreaterThanOrEqual(
      Math.round(mapBox.height),
    );
    await expect(page.locator('#map-export-state')).toContainText('PNG画像を保存しました');
    await expect(page.locator('#map')).not.toHaveClass(/map-export-capturing/);
  });

  test('空欄metadataはfallbackを使い、禁止文字や末尾空白を残さない', async ({
    page,
  }) => {
    await openMap(page);
    const fileName = await page.evaluate(() => JourneyMapExport.createPngFileName(
      {
        householdCode: ' ',
        journeyName: '<>:"/\\|?*',
        mapProjectName: '  ',
      },
      new Date(2026, 6, 27, 9, 5),
    ));

    expect(fileName).toBe([
      'mahoroba-map_code_journey_map_20260727',
      '0905.png',
    ].join('-'));
    expect(fileName).not.toMatch(/[<>:"/\\|?*]/);
  });

  test('現在のbounds・zoomを撮り、操作UIと選択表示を除外し、出典は残す', async ({
    page,
  }) => {
    await openMap(page);
    await loadExportScenario(page);
    await page.locator('.map-note-pin').first().click({ force: true });
    const expected = await page.evaluate(() => ({
      bounds: map.getBounds().toBBoxString(),
      zoom: map.getZoom(),
    }));

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-map-png').click();
    await downloadPromise;
    const call = await page.evaluate(() => window.__html2canvasCalls[0]);

    expect(call.bounds).toBe(expected.bounds);
    expect(call.zoom).toBe(expected.zoom);
    expect(call.controlVisibility).toBe('hidden');
    expect(call.statusVisibility).toBe('hidden');
    expect(call.attributionVisibility).not.toBe('hidden');
    await expect(page.locator('.map-note-marker-selected')).toHaveCount(1);
    expect(await page.evaluate(() => window.__mapExportXss)).toBe(false);
    await expect(page.locator('.map-note-content').first()).toHaveText(
      '駅徒歩圏の候補\n交通量と騒音を現地確認',
    );
    await expect(page.locator('.map-note-content').last()).toHaveText(
      '<img src=x onerror=window.__mapExportXss=true>',
    );
    const before = await page.evaluate(() =>
      MapCirclesAppState.captureProjectState().featureCollection);
    expect(before.features).toHaveLength(6);
    await page.evaluate(() => addCircle(35.165, 136.87));
    await expect.poll(async () => page.evaluate(() =>
      MapCirclesAppState.captureProjectState().featureCollection.features.length))
      .toBe(before.features.length + 1);
  });

  test('二重実行を防ぎ、処理中は両ボタンをdisabledにする', async ({ page }) => {
    await openMap(page);
    await page.evaluate(() => {
      window.__html2canvasDeferred = true;
      document.querySelector('#export-map-png').click();
      document.querySelector('#export-map-png').click();
    });

    await expect(page.locator('#export-map-png')).toBeDisabled();
    await expect(page.locator('#export-map-pdf')).toBeDisabled();
    expect(await page.evaluate(() => window.__html2canvasCalls.length)).toBe(1);
    await page.evaluate(() => window.__resolveHtml2canvas());
    await expect(page.locator('#export-map-png')).toBeEnabled();
    await expect(page.locator('#export-map-pdf')).toBeEnabled();
    await expect(page.locator('#map')).not.toHaveClass(/map-export-capturing/);
  });

  test('TileLayer eventを待ち、期限内にベース地図が揃わない場合はtimeoutする', async ({
    page,
  }) => {
    await openMap(page);
    const result = await page.evaluate(async () => {
      const layer = Array.from(Object.values(map._layers)).find(
        (candidate) => candidate.options?.exportRole === 'base',
      );
      const container = layer.getContainer();
      container.style.display = 'none';
      const originalIsLoading = layer.isLoading.bind(layer);
      layer.isLoading = () => true;
      const waiting = JourneyMapExport.waitForVisibleTiles(
        document.querySelector('#map'),
        100,
        map,
      );
      queueMicrotask(() => {
        container.style.display = '';
        layer.isLoading = originalIsLoading;
        layer.fire('load');
      });
      await waiting;

      container.style.display = 'none';
      layer.isLoading = () => true;
      let timeoutMessage = '';
      try {
        await JourneyMapExport.waitForVisibleTiles(
          document.querySelector('#map'),
          20,
          map,
        );
      } catch (error) {
        timeoutMessage = error.message;
      }
      container.style.display = '';
      layer.isLoading = originalIsLoading;
      return timeoutMessage;
    });

    expect(result).toContain('時間内に完了しませんでした');
  });

  for (const [variant, label] of [
    ['offscreen', '画面外'],
    ['display-none', 'display:none'],
    ['visibility-hidden', 'visibility:hidden'],
    ['opacity-zero', 'opacity:0'],
    ['old-zoom', '旧zoom container'],
  ]) {
    test(`${label}の失敗tileはPNGを妨げない`, async ({ page }) => {
      await openMap(page);
      await injectFailedBaseTile(page, variant);

      const downloadPromise = page.waitForEvent('download');
      await page.locator('#export-map-png').click();
      await downloadPromise;
      await expect(page.locator('#map-export-state')).toContainText(
        'PNG画像を保存しました',
      );
      expect(await page.evaluate(() => window.__html2canvasCalls.length)).toBe(1);
    });
  }

  test('提供範囲外hazard 404はPNGを妨げず、図形・メモと注意を残す', async ({
    page,
  }) => {
    const consoleErrors = [];
    const expectedResourceErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().startsWith('Failed to load resource:')) {
        expectedResourceErrors.push(message.text());
      } else {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await openMap(page, { hazardFailure: true });
    await loadExportScenario(page);
    await page.locator('input[data-hazard="hightide"]').check();
    await expect.poll(async () => page.evaluate(() => Object.values(
      hazardLayers.hightide._tiles,
    ).filter(({ el }) => el.complete && el.naturalWidth === 0).length))
      .toBeGreaterThan(0);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-map-png').click();
    await downloadPromise;
    const call = await page.evaluate(() => window.__html2canvasCalls[0]);

    await expect(page.locator('#map-export-state')).toContainText(
      '一部のハザードタイルは提供範囲外',
    );
    expect(call.featureKinds.sort()).toEqual([
      'circle',
      'circle',
      'line',
      'marker',
      'marker',
      'polygon',
    ]);
    expect(call.noteTexts).toContain('駅徒歩圏の候補\n交通量と騒音を現地確認');
    expect(expectedResourceErrors.length).toBeGreaterThan(0);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    await expect(page.locator('.map-export-skip-tile')).toHaveCount(0);
  });

  test('ベース地図が全面的に失敗した場合はdownloadしない', async ({
    page,
  }) => {
    const downloads = [];
    page.on('download', (download) => downloads.push(download));
    await openMap(page, { tileFailure: true });

    await page.locator('#export-map-png').click();
    await expect(page.locator('#map-export-state')).toContainText(
      'ベース地図を十分に読み込めませんでした',
    );
    await expect(page.locator('#map-export-state')).toHaveAttribute('data-kind', 'error');
    await expect(page.locator('#export-map-png')).toBeEnabled();
    expect(downloads).toEqual([]);
    expect(await page.evaluate(() => window.__html2canvasCalls.length)).toBe(0);
    await expect(page.locator('#map')).not.toHaveClass(/map-export-capturing/);
  });

  test('出力cleanup後も一時classが残らず地図操作できる', async ({ page }) => {
    await openMap(page);
    const before = await page.evaluate(() => map.getCenter().lng);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-map-png').click();
    await downloadPromise;
    await expect(page.locator('#map')).not.toHaveClass(/map-export-capturing/);
    await expect(page.locator('#export-map-png')).toBeEnabled();
    await page.evaluate(() => map.panBy([100, 0], { animate: false }));
    await expect.poll(async () => page.evaluate(() => map.getCenter().lng))
      .not.toBe(before);
  });

  test('画像renderer失敗時はdownloadせず、再実行可能なエラーへ戻る', async ({
    page,
  }) => {
    const downloads = [];
    page.on('download', (download) => downloads.push(download));
    await openMap(page);
    await page.evaluate(() => {
      window.__html2canvasFailure = 'Tainted canvases may not be exported';
    });

    await page.locator('#export-map-png').click();
    await expect(page.locator('#map-export-state')).toContainText('CORS制限');
    await expect(page.locator('#export-map-png')).toBeEnabled();
    await expect(page.locator('#export-map-pdf')).toBeEnabled();
    expect(downloads).toEqual([]);
    await expect(page.locator('#map')).not.toHaveClass(/map-export-capturing/);
  });
});

test.describe('A4横PDF用印刷画面', () => {
  test('同期openした別windowへ画像・匿名metadata・件数・hazard・注意を安全に構築してprintする', async ({
    page,
  }) => {
    await openMap(page);
    await loadExportScenario(page);
    await page.locator('input[data-hazard="flood"]').check();
    await page.evaluate(() => {
      const originalOpen = window.open.bind(window);
      window.open = (...args) => {
        const popup = originalOpen(...args);
        if (popup) {
          popup.print = () => {
            popup.document.body.dataset.printCalled = 'true';
          };
        }
        return popup;
      };
    });

    const popupPromise = page.waitForEvent('popup');
    await page.locator('#export-map-pdf').click();
    const popup = await popupPromise;
    await popup.locator('.print-sheet').waitFor();
    await expect(popup.locator('.map-image')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,iVBOR/,
    );
    await expect(popup.locator('.metadata')).toContainText('HH:EXPORT/01');
    await expect(popup.locator('.metadata')).toContainText('土地 探し*最終');
    await expect(popup.locator('.metadata')).toContainText(
      '名古屋駅<優先>|エリア?'.repeat(5),
    );
    await expect(popup.locator('.metadata')).toContainText('作成日時');
    await expect(popup.locator('.counts')).toHaveText(
      '地点・メモ 2 ／ 円 2 ／ 線 1 ／ 範囲 1',
    );
    await expect(popup.locator('.print-footer')).toContainText('洪水浸水想定区域');
    await expect(popup.locator('.print-footer')).toContainText(
      '必ず現地確認と自治体公表資料との照合',
    );
    await expect(popup.locator('.print-footer')).toContainText(
      'OpenStreetMap contributors',
    );
    expect(await popup.locator('style').evaluate((style) => style.textContent))
      .toContain('@page { size: A4 landscape;');
    await expect(popup.locator('body')).toHaveAttribute('data-print-called', 'true');
    expect(await popup.evaluate(() => window.__mapExportXss)).toBeUndefined();
    await expect(page.locator('#map-export-state')).toContainText('印刷画面を開きました');
    expect(popup.isClosed()).toBe(false);
    await expect(page.locator('#map')).not.toHaveClass(/map-export-capturing/);
  });

  test('popupが拒否された場合は画像生成を開始せず、操作可能なエラーを表示する', async ({
    page,
  }) => {
    await openMap(page);
    await page.evaluate(() => {
      window.open = () => null;
    });

    await page.locator('#export-map-pdf').click();
    await expect(page.locator('#map-export-state')).toContainText(
      'ポップアップを許可',
    );
    await expect(page.locator('#export-map-png')).toBeEnabled();
    await expect(page.locator('#export-map-pdf')).toBeEnabled();
    expect(await page.evaluate(() => window.__html2canvasCalls.length)).toBe(0);
  });

  test('snapshot失敗は印刷windowに再試行案内を表示し、printしない', async ({
    page,
  }) => {
    await openMap(page, { tileFailure: true });
    await page.evaluate(() => {
      const originalOpen = window.open.bind(window);
      window.open = (...args) => {
        const popup = originalOpen(...args);
        if (popup) {
          popup.print = () => {
            popup.document.body.dataset.printCalled = 'true';
          };
        }
        return popup;
      };
    });

    const popupPromise = page.waitForEvent('popup');
    await page.locator('#export-map-pdf').click();
    const popup = await popupPromise;
    await expect(popup.locator('.print-error-card')).toBeVisible();
    await expect(popup.locator('body')).toContainText(
      '元の地図画面へ戻り、表示位置や通信状態を確認',
    );
    await expect(popup.getByRole('button', { name: 'この画面を閉じる' }))
      .toBeVisible();
    await expect(popup.locator('body')).toContainText(
      'ベース地図を十分に読み込めませんでした',
    );
    await expect(popup.locator('body')).not.toHaveAttribute('data-print-called', 'true');
    await expect(page.locator('#map-export-state')).toHaveAttribute('data-kind', 'error');
    expect(popup.isClosed()).toBe(false);
  });

  test('失敗windowの閉じるボタンは利用者操作でwindowを閉じる', async ({ page }) => {
    await openMap(page);
    await page.evaluate(() => {
      window.__html2canvasFailure = '印刷画像を生成できません';
    });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#export-map-pdf').click();
    const popup = await popupPromise;
    await popup.getByRole('button', { name: 'この画面を閉じる' }).click();
    await expect.poll(() => popup.isClosed()).toBe(true);
  });
});

test.describe('responsive UIとPages path', () => {
  test('書き出しボタンは詳細版だけに存在する', () => {
    const path = require('node:path');
    const detailed = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'journey-map', 'index.html'),
      'utf8',
    );
    const lite = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'map-circles', 'index.html'),
      'utf8',
    );

    expect(detailed).toContain('id="export-map-png"');
    expect(detailed).toContain('id="export-map-pdf"');
    expect(lite).not.toContain('PNG画像を保存');
    expect(lite).not.toContain('PDFとして保存');
  });

  test('PCと360pxでJSON操作から分離した書き出しUIが読める', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page);
    await expect(page.locator('.map-export')).toBeVisible();
    await expect(page.locator('#export-map-png')).toHaveText('PNG画像を保存');
    await expect(page.locator('#export-map-pdf')).toHaveText('PDFとして保存');
    await expect(page.locator('#map-export-state')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('.map-export-help')).toContainText('現在の表示範囲');
    await expect(page.locator('#export-project')).toHaveText('JSON書出し');
    expect(new URL(page.url()).pathname).toBe(APP_PATH);

    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.locator('.map-export')).toBeVisible();
    const pngBox = await page.locator('#export-map-png').boundingBox();
    const pdfBox = await page.locator('#export-map-pdf').boundingBox();
    expect(pngBox.width).toBeGreaterThan(90);
    expect(pdfBox.width).toBeGreaterThan(90);
    expect(pngBox.x).toBeGreaterThanOrEqual(0);
    expect(pdfBox.x + pdfBox.width).toBeLessThanOrEqual(360);
  });

  test('360x800でもPNGとPDFを生成できる', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openMap(page);
    await loadExportScenario(page);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-map-png').click();
    await downloadPromise;
    await expect(page.locator('#map-export-state')).toContainText(
      'PNG画像を保存しました',
    );

    await page.evaluate(() => {
      const originalOpen = window.open.bind(window);
      window.open = (...args) => {
        const popup = originalOpen(...args);
        if (popup) popup.print = () => {
          popup.document.body.dataset.printCalled = 'true';
        };
        return popup;
      };
    });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#export-map-pdf').click();
    const popup = await popupPromise;
    await expect(popup.locator('.print-sheet')).toBeVisible();
    await expect(popup.locator('body')).toHaveAttribute('data-print-called', 'true');
  });
});
