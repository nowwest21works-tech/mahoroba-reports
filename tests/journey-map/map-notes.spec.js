const { test, expect } = require('@playwright/test');
const {
  clickMap,
  getAppState,
  getMapState,
  openMap,
} = require('./support/map-test-helpers');

async function waitForProjectManager(page) {
  await expect(page.locator('#project-state')).not.toHaveText('保存状態を確認中');
}

async function waitForProjectAction(page, controlSelector, statusMessage) {
  await expect(page.locator('#status')).toHaveText(statusMessage);
  await expect(page.locator(controlSelector)).toBeEnabled();
}

async function placeNote(page, label, xRatio = 0.5, yRatio = 0.5) {
  await page.locator('#map-note-input').fill(label);
  await page.locator('#place-map-note').click();
  await expect(page.locator('#place-map-note')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await clickMap(page, xRatio, yRatio);
  await expect(page.locator('#status')).toHaveText('地図メモを配置しました');
  await expect(page.locator('#place-map-note')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
}

async function markerFeatures(page) {
  const state = await getAppState(page);
  return state.mapProject.featureCollection.features.filter(
    (feature) => feature.properties.kind === 'marker',
  );
}

async function noteLayerState(page) {
  return page.evaluate(() => {
    const notes = [];
    map.eachLayer((layer) => {
      const tooltip = typeof layer.getTooltip === 'function'
        ? layer.getTooltip()
        : null;
      if (!tooltip || tooltip.options.className !== 'map-note-tooltip') return;
      const latlng = layer.getLatLng();
      notes.push({
        lat: latlng.lat,
        lng: latlng.lng,
        tooltip: tooltip.getContent().textContent,
      });
    });
    return notes;
  });
}

async function saveProject(page) {
  await page.locator('#save-project').click();
  await waitForProjectAction(
    page,
    '#save-project',
    '地図をこのブラウザに保存しました',
  );
  return page.evaluate(async () => {
    const records = await JourneyMapIndexedDb.listProjects();
    return records[0];
  });
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function expectSingleNoteTooltip(page, label) {
  const notes = page.locator('.map-note-content');
  await expect(notes).toHaveCount(1);
  await expect(notes).toHaveText(label);
}

test.describe('Marker labelを使う地図メモ', () => {
  test('入力、操作案内、120文字制限、個人情報注意を表示する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);

    await expect(page.locator('.map-note-section h2')).toHaveText('地図メモ');
    await expect(page.locator('#map-note-input')).toHaveAttribute(
      'placeholder',
      '例：駅徒歩圏。交通量と騒音を現地確認',
    );
    await expect(page.locator('#map-note-input')).toHaveAttribute('maxlength', '120');
    await expect(page.locator('#place-map-note')).toHaveText('メモを地図に置く');
    await expect(page.locator('#update-map-note')).toHaveText(
      '選択中のメモを更新',
    );
    await expect(page.locator('#map-note-guide')).toContainText(
      '地図上の配置したい場所をクリックしてください',
    );
    await expect(page.locator('#map-note-privacy')).toContainText(
      '個人情報を入力しないでください',
    );
  });

  test('日本語メモをMarker labelとして配置し未保存変更にする', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '駅徒歩圏。交通量を現地確認');

    const features = await markerFeatures(page);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      type: 'Feature',
      geometry: { type: 'Point' },
      properties: {
        schemaVersion: 1,
        kind: 'marker',
        label: '駅徒歩圏。交通量を現地確認',
      },
    });
    expect(Object.keys(features[0].properties).sort()).toEqual([
      'kind',
      'label',
      'schemaVersion',
    ]);
    await expect(page.locator('.map-note-tooltip')).toHaveText(
      '駅徒歩圏。交通量を現地確認',
    );
    await expect(page.locator('#project-state')).toContainText('未保存の変更あり');
  });

  test('空文字を拒否して配置モードへ入らない', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);

    await page.locator('#map-note-input').fill('   ');
    await page.locator('#place-map-note').click();

    await expect(page.locator('#map-note-state')).toHaveText(
      '地図メモを入力してください',
    );
    await expect(page.locator('#place-map-note')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(await markerFeatures(page)).toEqual([]);
  });

  test('120文字を超える入力を明示的に拒否する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);

    await page.locator('#map-note-input').evaluate((element) => {
      element.value = '架'.repeat(121);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#place-map-note').click();

    await expect(page.locator('#map-note-state')).toHaveText(
      '地図メモは120文字以内で入力してください',
    );
    await expect(page.locator('#map-note-counter')).toHaveText('121 / 120');
    expect(await markerFeatures(page)).toEqual([]);
  });

  test('日本語の改行を常時表示へ保持する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    const label = '駅徒歩圏。\n交通量と騒音を\n現地確認';
    await placeNote(page, label);

    await expect(page.locator('.map-note-content')).toHaveText(label);
    expect(await page.locator('.map-note-content').evaluate(
      (element) => getComputedStyle(element).whiteSpace,
    )).toBe('pre-wrap');
    expect((await markerFeatures(page))[0].properties.label).toBe(label);
  });

  test('HTMLをtextContentとして表示しscript、style、linkを実行しない', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__mapNoteXss = false;
    });
    await openMap(page);
    await waitForProjectManager(page);
    const label =
      '<script>window.__mapNoteXss=true</script>\n<style>x{color:red}</style>\n<link href=x>';
    await placeNote(page, label);

    await expect(page.locator('.map-note-content')).toHaveText(label);
    await expect(page.locator('.map-note-content script')).toHaveCount(0);
    await expect(page.locator('.map-note-content style')).toHaveCount(0);
    await expect(page.locator('.map-note-content link')).toHaveCount(0);
    expect(await page.evaluate(() => window.__mapNoteXss)).toBe(false);
  });

  test('地図上のメモをクリックして選択しtextareaへ読み込む', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '選択する架空メモ');
    await page.locator('#map-note-input').fill('');

    await page.locator('.map-note-marker').click();

    await expect(page.locator('#map-note-input')).toHaveValue('選択する架空メモ');
    await expect(page.locator('#update-map-note')).toBeEnabled();
    await expect(page.locator('.map-note-marker')).toHaveClass(
      /map-note-marker-selected/,
    );
  });

  test('選択中のメモ内容を更新してFeatureへcommitする', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '更新前の架空メモ');
    await page.locator('#map-note-input').fill('更新後の架空メモ\n現地確認');

    await page.locator('#update-map-note').click();

    await expect(page.locator('#status')).toHaveText('地図メモを更新しました');
    await expect(page.locator('.map-note-content')).toHaveText(
      '更新後の架空メモ\n現地確認',
    );
    expect((await markerFeatures(page))[0].properties.label).toBe(
      '更新後の架空メモ\n現地確認',
    );
    await expect(page.locator('#project-state')).toContainText('未保存の変更あり');
  });

  test('全体を移動相当のcanonical drag eventで位置と保存内容を更新する', async ({
    page,
  }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '移動する架空メモ');

    await page.evaluate(() => {
      let noteLayer = null;
      map.eachLayer((layer) => {
        const tooltip = typeof layer.getTooltip === 'function'
          ? layer.getTooltip()
          : null;
        if (tooltip && tooltip.options.className === 'map-note-tooltip') {
          noteLayer = layer;
        }
      });
      noteLayer.fire('pm:dragstart');
      noteLayer.setLatLng([35.25, 136.95]);
      noteLayer.fire('pm:dragend');
    });

    const feature = (await markerFeatures(page))[0];
    expect(feature.geometry.coordinates[0]).toBeCloseTo(136.95, 5);
    expect(feature.geometry.coordinates[1]).toBeCloseTo(35.25, 5);
    const record = await saveProject(page);
    expect(record.featureCollection.features[0].geometry.coordinates)
      .toEqual(feature.geometry.coordinates);
  });

  test('削除する操作でメモをFeatureCollectionと保存内容から削除する', async ({
    page,
  }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '削除する架空メモ');

    await page.evaluate(() => {
      let noteLayer = null;
      map.eachLayer((layer) => {
        const tooltip = typeof layer.getTooltip === 'function'
          ? layer.getTooltip()
          : null;
        if (tooltip && tooltip.options.className === 'map-note-tooltip') {
          noteLayer = layer;
        }
      });
      map.fire('pm:remove', { layer: noteLayer });
    });

    expect(await markerFeatures(page)).toEqual([]);
    await expect(page.locator('.map-note-tooltip')).toHaveCount(0);
    await expect(page.locator('#update-map-note')).toBeDisabled();
    const record = await saveProject(page);
    expect(record.featureCollection.features).toEqual([]);
  });

  test('保存、reload、保存済み地図を開く操作でメモを復元する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '保存して復元する\n架空メモ');
    const record = await saveProject(page);

    await page.reload();
    await page.locator('#map.leaflet-container').waitFor();
    await waitForProjectManager(page);
    await page.locator('#saved-projects').selectOption(record.projectId);
    await page.locator('#open-project').click();
    await waitForProjectAction(
      page,
      '#open-project',
      '保存済み地図を開きました',
    );

    expect((await markerFeatures(page))[0].properties.label).toBe(
      '保存して復元する\n架空メモ',
    );
    await expect(page.locator('.map-note-content')).toHaveText(
      '保存して復元する\n架空メモ',
    );
  });

  test('複製した保存recordと表示へメモを復元する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '複製する架空メモ');
    const original = await saveProject(page);

    await page.locator('#duplicate-project').click();
    await waitForProjectAction(
      page,
      '#duplicate-project',
      '地図を複製して保存しました',
    );

    const records = await page.evaluate(() => JourneyMapIndexedDb.listProjects());
    expect(records).toHaveLength(2);
    expect(records[0].projectId).not.toBe(original.projectId);
    expect(records[0].featureCollection.features[0].properties.label)
      .toBe('複製する架空メモ');
    await expectSingleNoteTooltip(page, '複製する架空メモ');
  });

  test('JSON書出しと読込でMarker labelのメモを復元する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, 'JSONで復元する\n架空メモ');
    await saveProject(page);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-project').click();
    const backup = await readDownload(await downloadPromise);
    await page.locator('#new-project').click();
    await page.locator('#import-file').setInputFiles({
      name: 'note-backup.mahoroba-map.json',
      mimeType: 'application/json',
      buffer: backup,
    });
    await waitForProjectAction(
      page,
      '#import-file',
      'JSONバックアップを読み込みました',
    );

    expect((await markerFeatures(page))[0].properties.label).toBe(
      'JSONで復元する\n架空メモ',
    );
    await expectSingleNoteTooltip(page, 'JSONで復元する\n架空メモ');
  });

  test('JSON適用失敗時に現在のメモとFeatureCollectionをrollbackする', async ({
    page,
  }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '現在表示中の架空メモ');
    const before = await getAppState(page);
    const backup = await page.evaluate(() => {
      const feature = MapCirclesGeoJsonAdapter.shapeRecordToFeature({
        kind: 'marker',
        center: [35.21, 136.91],
        label: '読込側の架空メモ',
      });
      return JourneyMapProjectSchema.createRecord({
        householdCode: 'HH-020',
        journeyName: '架空案件',
        mapProjectName: '架空地図',
        featureCollection: {
          type: 'FeatureCollection',
          features: [feature],
        },
        viewport: MapCirclesAppState.captureProjectState().viewport,
      });
    });
    await page.evaluate(() => {
      const originalRenderList = renderList;
      window.renderList = () => {
        window.renderList = originalRenderList;
        throw new Error('synthetic map note import failure');
      };
    });
    page.once('dialog', (dialog) => dialog.accept());

    await page.locator('#import-file').setInputFiles({
      name: 'rollback-note.mahoroba-map.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.locator('#project-state')).toContainText(
      'synthetic map note import failure',
    );
    await expect(page.locator('#import-file')).toBeEnabled();

    expect((await getAppState(page)).mapProject.featureCollection)
      .toEqual(before.mapProject.featureCollection);
    await expectSingleNoteTooltip(page, '現在表示中の架空メモ');
    expect(await page.evaluate(() => JourneyMapIndexedDb.listProjects()))
      .toEqual([]);
  });

  test('メモ配置clickをCircle追加から分離し配置後は自動終了する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, 'Circleと競合しない架空メモ', 0.35, 0.5);

    expect((await getMapState(page)).circles).toEqual([]);
    expect((await getAppState(page)).mapProject.featureCollection.features.map(
      (feature) => feature.properties.kind,
    )).toEqual(['marker']);

    await clickMap(page, 0.7, 0.5);

    expect((await getMapState(page)).circles).toHaveLength(1);
    expect((await getAppState(page)).mapProject.featureCollection.features.map(
      (feature) => feature.properties.kind,
    )).toEqual(['marker', 'circle']);
  });

  test('PC表示で吹き出しが4行相当へ収まりtoolbarを隠さない', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '一行目\n二行目\n三行目\n四行目\n五行目', 0.5, 0.65);

    const tooltipBox = await page.locator('.map-note-tooltip').boundingBox();
    const toolbarBox = await page.locator('.leaflet-pm-toolbar').first().boundingBox();
    expect(tooltipBox.width).toBeLessThanOrEqual(240);
    expect(tooltipBox.height).toBeLessThan(100);
    expect(
      tooltipBox.x < toolbarBox.x + toolbarBox.width
      && tooltipBox.x + tooltipBox.width > toolbarBox.x
      && tooltipBox.y < toolbarBox.y + toolbarBox.height
      && tooltipBox.y + tooltipBox.height > toolbarBox.y,
    ).toBe(false);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('360px表示で入力と吹き出しが画面内に収まりerrorを出さない', async ({
    page,
  }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 360, height: 800 });
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, 'スマートフォンで確認する\n架空メモ', 0.5, 0.65);

    const inputBox = await page.locator('#map-note-input').boundingBox();
    const actionsBox = await page.locator('.map-note-actions').boundingBox();
    const tooltipBox = await page.locator('.map-note-tooltip').boundingBox();
    expect(inputBox.x).toBeGreaterThanOrEqual(0);
    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(360);
    expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(360);
    expect(tooltipBox.width).toBeLessThanOrEqual(190);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('Marker移動後もメモの常時表示と選択を維持する', async ({ page }) => {
    await openMap(page);
    await waitForProjectManager(page);
    await placeNote(page, '移動後も選択する架空メモ');

    await page.evaluate(() => {
      let noteLayer = null;
      map.eachLayer((layer) => {
        const tooltip = typeof layer.getTooltip === 'function'
          ? layer.getTooltip()
          : null;
        if (tooltip && tooltip.options.className === 'map-note-tooltip') {
          noteLayer = layer;
        }
      });
      noteLayer.fire('pm:dragstart');
      noteLayer.setLatLng([35.175, 136.885]);
      noteLayer.fire('pm:dragend');
    });
    await page.locator('#map-note-input').fill('');
    await page.locator('.map-note-marker').click();

    await expect(page.locator('.map-note-tooltip')).toBeVisible();
    await expect(page.locator('#map-note-input')).toHaveValue(
      '移動後も選択する架空メモ',
    );
    const [layerState] = await noteLayerState(page);
    expect(layerState.lat).toBeCloseTo(35.175, 5);
    expect(layerState.lng).toBeCloseTo(136.885, 5);
    expect(layerState.tooltip).toBe('移動後も選択する架空メモ');
  });
});
