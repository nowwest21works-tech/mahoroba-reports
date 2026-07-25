const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  clickMap,
  getAppState,
  getMapState,
  openMap,
} = require('./support/map-test-helpers');

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function createShape(page, kind, options = {}) {
  return page.evaluate(({ kind, options }) => {
    window.__geomanTestLayers = window.__geomanTestLayers || {};
    let layer;
    if (kind === 'marker') {
      layer = L.marker(options.center || [35.1709, 136.8815], {
        pmIgnore: false,
      });
    } else if (kind === 'circle') {
      layer = L.circle(options.center || [35.1709, 136.8815], {
        radius: options.radius || 800,
        pmIgnore: false,
      });
    } else if (kind === 'line') {
      layer = L.polyline(options.points || [
        [35.1709, 136.8815],
        [35.1809, 136.8915],
      ], { pmIgnore: false });
    } else {
      layer = L.polygon(options.points || [
        [35.1709, 136.8815],
        [35.1709, 136.8915],
        [35.1809, 136.8915],
      ], { pmIgnore: false });
    }
    layer.addTo(map);
    window.__geomanTestLayers[kind] = layer;
    const shape = {
      marker: 'Marker',
      circle: 'Circle',
      line: 'Line',
      polygon: 'Polygon',
    }[kind];
    map.fire('pm:create', { shape, layer });
    return MapCirclesAppState.getCurrentMapProject().featureCollection.features
      .find((feature) => feature.properties.kind === kind);
  }, { kind, options });
}

async function getEditorState(page) {
  return page.evaluate(() => {
    const canonicalLayers = [];
    map.eachLayer((layer) => {
      if (!layer.options || layer.options.pmIgnore !== false) return;
      let kind = 'unknown';
      let geometry = null;
      if (layer instanceof L.Circle) {
        kind = 'circle';
        const center = layer.getLatLng();
        geometry = {
          center: [center.lat, center.lng],
          radius: layer.getRadius(),
        };
      } else if (layer instanceof L.Marker) {
        kind = 'marker';
        const center = layer.getLatLng();
        geometry = [center.lat, center.lng];
      } else if (layer instanceof L.Polygon) {
        kind = 'polygon';
        geometry = layer.getLatLngs()[0].map((point) => [point.lat, point.lng]);
      } else if (layer instanceof L.Polyline) {
        kind = 'line';
        geometry = layer.getLatLngs().map((point) => [point.lat, point.lng]);
      }
      canonicalLayers.push({ kind, geometry });
    });
    canonicalLayers.sort((a, b) => a.kind.localeCompare(b.kind));
    return {
      snapshot: MapCirclesAppState.getSnapshot(),
      mapProject: MapCirclesAppState.getCurrentMapProject(),
      circles: circles.map((record) => ({
        id: record.id,
        featureId: record.featureId,
        center: record.center,
        radius: record.radius,
        color: record.color,
        label: record.label,
      })),
      canonicalLayers,
      labels: [...document.querySelectorAll('.circle-label')]
        .map((label) => label.textContent),
      listDom: {
        badgeText: document.getElementById('count-badge').textContent,
        listHtml: document.getElementById('circle-list').innerHTML,
      },
      nextId,
    };
  });
}

async function editShape(page, kind, geometry, eventName = 'pm:update') {
  await page.evaluate(({ kind, geometry, eventName }) => {
    const layer = window.__geomanTestLayers[kind];
    const shape = layer.pm.getShape();
    layer.fire(
      eventName === 'pm:dragend' ? 'pm:dragstart' : 'pm:enable',
      { layer, shape },
    );
    if (kind === 'marker') {
      layer.setLatLng(geometry.center);
    } else if (kind === 'circle') {
      layer.setLatLng(geometry.center);
      layer.setRadius(geometry.radius);
    } else {
      layer.setLatLngs(geometry.points);
    }
    layer.fire(eventName, { layer, shape });
  }, { kind, geometry, eventName });
}

async function removeShape(page, kind) {
  await page.evaluate((kind) => {
    const layer = window.__geomanTestLayers[kind];
    map.removeLayer(layer);
    map.fire('pm:remove', { layer });
  }, kind);
}

test.describe('Leaflet-Geoman dependencyとtoolbar', () => {
  test('2.20.0固定assetをnode_modulesから読み込み、許可toolbarだけを表示する', async ({
    page,
  }) => {
    const audit = await openMap(page);
    const packageJson = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../package.json'),
      'utf8',
    ));
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../journey-map/index.html'),
      'utf8',
    );

    expect(packageJson.devDependencies['@geoman-io/leaflet-geoman-free'])
      .toBe('2.20.0');
    expect(source).toContain(
      'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.20.0/dist/leaflet-geoman.css',
    );
    expect(source).toContain(
      'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.20.0/dist/leaflet-geoman.js',
    );
    expect(audit.unexpectedExternal).toEqual([]);
    expect(audit.geomanRequests.sort()).toEqual([
      'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.20.0/dist/leaflet-geoman.css',
      'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.20.0/dist/leaflet-geoman.js',
    ]);
    expect(await page.evaluate(() => ({
      version: L.PM.version,
      hasGlobalPm: Boolean(L.PM),
      hasMapPm: Boolean(map.pm),
    }))).toEqual({
      version: '2.20.0',
      hasGlobalPm: true,
      hasMapPm: true,
    });

    for (const className of [
      'marker',
      'circle',
      'polyline',
      'polygon',
      'edit',
      'drag',
      'delete',
    ]) {
      await expect(page.locator(`.leaflet-pm-icon-${className}`)).toBeVisible();
    }
    for (const className of [
      'circle-marker',
      'rectangle',
      'text',
      'cut',
      'rotate',
    ]) {
      await expect(page.locator(`.leaflet-pm-icon-${className}`)).toHaveCount(0);
    }
  });

  test('legacy Circleだけが編集対象でlabel markerは対象外', async ({ page }) => {
    await openMap(page);
    await clickMap(page);
    expect(await page.evaluate(() => ({
      circlePm: Boolean(circles[0].circle.pm),
      circlePmIgnore: circles[0].circle.options.pmIgnore,
      labelPm: Boolean(circles[0].marker.pm),
      labelPmIgnore: circles[0].marker.options.pmIgnore,
    }))).toEqual({
      circlePm: true,
      circlePmIgnore: false,
      labelPm: false,
      labelPmIgnore: true,
    });
  });

  test('private registryと編集用書込みAPIをglobalへ公開しない', async ({ page }) => {
    await openMap(page);
    expect(await page.evaluate(() => ({
      appStateKeys: Object.keys(MapCirclesAppState).sort(),
      createGeometry: typeof window.createGeometry,
      editGeometry: typeof window.editGeometry,
      geometryEditorRuntime: typeof window.geometryEditorRuntime,
      layerRegistry: typeof window.layerRegistry,
      removeGeometry: typeof window.removeGeometry,
    }))).toEqual({
      appStateKeys: [
        'captureProjectState',
        'getCurrentMapProject',
        'getSnapshot',
        'replaceProjectState',
      ],
      createGeometry: 'undefined',
      editGeometry: 'undefined',
      geometryEditorRuntime: 'undefined',
      layerRegistry: 'undefined',
      removeGeometry: 'undefined',
    });
  });

  test('Geoman draw mode中のmap clickではlegacy Circleを追加しない', async ({ page }) => {
    await openMap(page);
    await page.evaluate(() => map.pm.enableDraw('Line'));
    await clickMap(page, 0.45, 0.5);
    await clickMap(page, 0.55, 0.5);
    expect((await getMapState(page)).circles).toEqual([]);
    await page.evaluate(() => map.pm.disableDraw('Line'));
    await clickMap(page);
    expect((await getMapState(page)).circles).toHaveLength(1);
  });

  test('toolbarのMarker描画操作がcanonical Featureを作成する', async ({ page }) => {
    await openMap(page);
    await page.locator('.leaflet-pm-icon-marker').click();
    await clickMap(page);

    await expect.poll(async () => (
      await getAppState(page)
    ).mapProject.featureCollection.features.length).toBe(1);
    const feature = (await getAppState(page))
      .mapProject.featureCollection.features[0];
    expect(feature.id).toMatch(UUID_PATTERN);
    expect(feature.geometry.type).toBe('Point');
    expect(feature.properties).toEqual({
      schemaVersion: 1,
      kind: 'marker',
      label: '地点1',
    });
    expect((await getMapState(page)).circles).toEqual([]);

    const editedFeature = await page.evaluate(() => {
      let markerLayer = null;
      map.eachLayer((layer) => {
        if (
          layer instanceof L.Marker
          && layer.options.pmIgnore === false
        ) {
          markerLayer = layer;
        }
      });
      const shape = markerLayer.pm ? markerLayer.pm.getShape() : 'Marker';
      markerLayer.fire('pm:enable', { layer: markerLayer, shape });
      markerLayer.setLatLng([35.175, 136.885]);
      markerLayer.fire('pm:update', { layer: markerLayer, shape });
      return MapCirclesAppState.getCurrentMapProject()
        .featureCollection.features[0];
    });
    expect(editedFeature.id).toBe(feature.id);
    expect(editedFeature.geometry.coordinates).toEqual([136.885, 35.175]);
  });
});

test.describe('Geoman create／edit／drag／remove同期', () => {
  test('Marker、Circle、Line、PolygonをMixed FeatureCollectionへ追加する', async ({
    page,
  }) => {
    await openMap(page);
    for (const kind of ['marker', 'circle', 'line', 'polygon']) {
      const feature = await createShape(page, kind);
      expect(feature.id).toMatch(UUID_PATTERN);
    }

    const state = await getEditorState(page);
    expect(state.mapProject.featureCollection.features.map(
      (feature) => feature.properties.kind,
    )).toEqual(['marker', 'circle', 'line', 'polygon']);
    expect(state.mapProject.featureCollection.features[2].geometry.type)
      .toBe('LineString');
    expect(state.mapProject.featureCollection.features[3].geometry.type)
      .toBe('Polygon');
    expect(state.circles).toHaveLength(1);
    expect(state.canonicalLayers).toHaveLength(4);
    expect(state.labels).toHaveLength(1);
    await expect(page.locator('.circle-item')).toHaveCount(1);
  });

  test('Marker、Circle、Line、Polygon編集でIDを維持してgeometryを更新する', async ({
    page,
  }) => {
    await openMap(page);
    for (const kind of ['marker', 'circle', 'line', 'polygon']) {
      await createShape(page, kind);
    }
    const before = await getAppState(page);
    const ids = Object.fromEntries(before.mapProject.featureCollection.features.map(
      (feature) => [feature.properties.kind, feature.id],
    ));
    await page.waitForTimeout(5);

    await editShape(page, 'marker', { center: [35.1715, 136.8825] });
    await editShape(page, 'circle', {
      center: [35.1725, 136.8835],
      radius: 1200,
    });
    await editShape(page, 'line', {
      points: [[35.171, 136.882], [35.182, 136.893], [35.19, 136.9]],
    });
    await editShape(page, 'polygon', {
      points: [[
        [35.171, 136.882],
        [35.171, 136.894],
        [35.183, 136.894],
      ]],
    });

    const after = await getEditorState(page);
    expect(Object.fromEntries(after.mapProject.featureCollection.features.map(
      (feature) => [feature.properties.kind, feature.id],
    ))).toEqual(ids);
    expect(after.mapProject.updatedAt).not.toBe(before.mapProject.updatedAt);
    expect(after.mapProject.featureCollection.features.find(
      (feature) => feature.properties.kind === 'circle',
    ).properties.radiusMeters).toBe(1200);
    expect(after.circles[0]).toMatchObject({
      center: [35.1725, 136.8835],
      radius: 1200,
    });
    expect(after.labels[0]).toContain('1.2km');
    expect(after.listDom.listHtml).toContain('1.2km');
  });

  test('全kindのdrag完了時にgeometryを同期する', async ({ page }) => {
    await openMap(page);
    for (const kind of ['marker', 'circle', 'line', 'polygon']) {
      await createShape(page, kind);
    }

    await editShape(
      page,
      'marker',
      { center: [35.172, 136.883] },
      'pm:dragend',
    );
    await editShape(page, 'circle', {
      center: [35.173, 136.884],
      radius: 900,
    }, 'pm:dragend');
    await editShape(page, 'line', {
      points: [[35.172, 136.883], [35.182, 136.893]],
    }, 'pm:dragend');
    await editShape(page, 'polygon', {
      points: [[
        [35.172, 136.883],
        [35.172, 136.893],
        [35.182, 136.893],
      ]],
    }, 'pm:dragend');

    const features = (await getAppState(page)).mapProject.featureCollection.features;
    expect(features.find((feature) => feature.properties.kind === 'marker')
      .geometry.coordinates).toEqual([136.883, 35.172]);
    expect(features.find((feature) => feature.properties.kind === 'circle')
      .geometry.coordinates).toEqual([136.884, 35.173]);
    expect(features.find((feature) => feature.properties.kind === 'line')
      .geometry.coordinates[0]).toEqual([136.883, 35.172]);
    expect(features.find((feature) => feature.properties.kind === 'polygon')
      .geometry.coordinates[0][0]).toEqual([136.883, 35.172]);
  });

  test('MapへEdit／Drag eventを発火してもcommitせずlayer eventだけで同期する', async ({
    page,
  }) => {
    await openMap(page);
    await createShape(page, 'circle');
    const initial = await getAppState(page);

    const afterMapEdit = await page.evaluate(() => {
      const layer = window.__geomanTestLayers.circle;
      const shape = layer.pm.getShape();
      layer.fire('pm:enable', { layer, shape });
      layer.setLatLng([35.18, 136.89]);
      layer.setRadius(1100);
      map.fire('pm:update', { layer, shape });
      return MapCirclesAppState.getCurrentMapProject();
    });
    expect(afterMapEdit).toEqual(initial.mapProject);

    await page.evaluate(() => {
      const layer = window.__geomanTestLayers.circle;
      layer.fire('pm:update', { layer, shape: layer.pm.getShape() });
    });
    const afterLayerEdit = await getAppState(page);
    expect(afterLayerEdit.mapProject.featureCollection.features[0]
      .geometry.coordinates).toEqual([136.89, 35.18]);
    expect(afterLayerEdit.mapProject.featureCollection.features[0]
      .properties.radiusMeters).toBe(1100);

    await page.waitForTimeout(5);
    const afterMapDrag = await page.evaluate(() => {
      const layer = window.__geomanTestLayers.circle;
      const shape = layer.pm.getShape();
      layer.fire('pm:dragstart', { layer, shape });
      layer.setLatLng([35.19, 136.9]);
      map.fire('pm:dragend', { layer, shape });
      return MapCirclesAppState.getCurrentMapProject();
    });
    expect(afterMapDrag).toEqual(afterLayerEdit.mapProject);

    await page.evaluate(() => {
      const layer = window.__geomanTestLayers.circle;
      layer.fire('pm:dragend', { layer, shape: layer.pm.getShape() });
    });
    const afterLayerDrag = await getEditorState(page);
    expect(afterLayerDrag.mapProject.featureCollection.features[0]
      .geometry.coordinates).toEqual([136.9, 35.19]);
    expect(afterLayerDrag.circles[0].center).toEqual([35.19, 136.9]);
    expect(afterLayerDrag.labels[0]).toContain('1.1km');
    expect(afterLayerDrag.listDom.listHtml).toContain('1.1km');
  });

  test('同じCircleでDrag後のEditもスキップせず連続commitする', async ({ page }) => {
    await openMap(page);
    const created = await createShape(page, 'circle');
    const before = await getAppState(page);
    await page.waitForTimeout(5);

    await editShape(page, 'circle', {
      center: [35.18, 136.89],
      radius: 900,
    }, 'pm:dragend');
    const afterDrag = await getAppState(page);
    expect(afterDrag.mapProject.updatedAt).not.toBe(before.mapProject.updatedAt);
    await page.waitForTimeout(5);

    await editShape(page, 'circle', {
      center: [35.19, 136.9],
      radius: 1300,
    });
    const afterEdit = await getEditorState(page);
    const finalFeature = afterEdit.mapProject.featureCollection.features[0];
    expect(finalFeature.id).toBe(created.id);
    expect(finalFeature.geometry.coordinates).toEqual([136.9, 35.19]);
    expect(finalFeature.properties.radiusMeters).toBe(1300);
    expect(afterEdit.mapProject.updatedAt).not.toBe(afterDrag.mapProject.updatedAt);
    expect(afterEdit.circles[0]).toMatchObject({
      featureId: created.id,
      center: [35.19, 136.9],
      radius: 1300,
    });
    expect(afterEdit.labels[0]).toContain('1.3km');
    expect(afterEdit.listDom.listHtml).toContain('1.3km');
  });

  test('Geoman removeで各kindとCircle補助表示を削除する', async ({ page }) => {
    await openMap(page);
    for (const kind of ['marker', 'circle', 'line', 'polygon']) {
      await createShape(page, kind);
    }
    for (const kind of ['marker', 'circle', 'line', 'polygon']) {
      await removeShape(page, kind);
    }

    const state = await getEditorState(page);
    expect(state.mapProject.featureCollection.features).toEqual([]);
    expect(state.circles).toEqual([]);
    expect(state.canonicalLayers).toEqual([]);
    expect(state.labels).toEqual([]);
    await expect(page.locator('.circle-item')).toHaveCount(0);
  });

  test('全削除はCircleだけを削除し他shapeを維持する', async ({ page }) => {
    await openMap(page);
    for (const kind of ['marker', 'circle', 'line', 'polygon']) {
      await createShape(page, kind);
    }
    const button = page.locator('#clear-all');
    await button.click();
    await button.click();

    const state = await getEditorState(page);
    expect(state.mapProject.featureCollection.features.map(
      (feature) => feature.properties.kind,
    )).toEqual(['marker', 'line', 'polygon']);
    expect(state.circles).toEqual([]);
    expect(state.canonicalLayers.map((entry) => entry.kind))
      .toEqual(['line', 'marker', 'polygon']);
  });
});

test.describe('Geoman transaction rollback', () => {
  test('Circle create中のsynthetic failureで全状態を維持する', async ({ page }) => {
    await openMap(page);
    const before = await getEditorState(page);
    await page.evaluate(() => {
      const original = window.renderList;
      window.renderList = () => {
        window.renderList = original;
        throw new Error('synthetic geoman create failure');
      };
    });
    await createShape(page, 'circle');
    const after = await getEditorState(page);

    expect(after).toEqual(before);
    expect(after.mapProject.updatedAt).toBe(before.mapProject.updatedAt);
  });

  test('Circle edit中のsynthetic failureでgeometryと一覧を復元する', async ({
    page,
  }) => {
    await openMap(page);
    await createShape(page, 'circle');
    const before = await getEditorState(page);
    await page.evaluate(() => {
      const original = window.renderList;
      window.renderList = () => {
        window.renderList = original;
        throw new Error('synthetic geoman edit failure');
      };
    });
    await editShape(page, 'circle', {
      center: [35.19, 136.9],
      radius: 1500,
    });
    const after = await getEditorState(page);

    expect(after).toEqual(before);
    expect(after.mapProject.updatedAt).toBe(before.mapProject.updatedAt);
  });

  test('Lineのsynthetic invalid editでgeometryとsnapshotを復元する', async ({
    page,
  }) => {
    await openMap(page);
    await createShape(page, 'line');
    const before = await getEditorState(page);
    await editShape(page, 'line', {
      points: [[35.19, 136.9]],
    });
    const after = await getEditorState(page);

    expect(after).toEqual(before);
    expect(after.mapProject.updatedAt).toBe(before.mapProject.updatedAt);
  });

  test('Circle drag中のsynthetic failureで全状態を復元する', async ({ page }) => {
    await openMap(page);
    await createShape(page, 'circle');
    const before = await getEditorState(page);
    await page.evaluate(() => {
      const original = window.renderList;
      window.renderList = () => {
        window.renderList = original;
        throw new Error('synthetic geoman drag failure');
      };
    });
    await editShape(page, 'circle', {
      center: [35.2, 136.91],
      radius: 1700,
    }, 'pm:dragend');
    const after = await getEditorState(page);

    expect(after).toEqual(before);
    expect(after.mapProject.updatedAt).toBe(before.mapProject.updatedAt);
  });

  test('Geoman remove中のsynthetic failureでlayerとsnapshotを復元する', async ({
    page,
  }) => {
    await openMap(page);
    await createShape(page, 'circle');
    const before = await getEditorState(page);
    await page.evaluate(() => {
      const original = window.renderList;
      window.renderList = () => {
        window.renderList = original;
        throw new Error('synthetic geoman remove failure');
      };
    });
    await removeShape(page, 'circle');
    const after = await getEditorState(page);

    expect(after).toEqual(before);
    expect(after.mapProject.updatedAt).toBe(before.mapProject.updatedAt);
  });
});

test.describe('Geoman regressionとmobile', () => {
  test('reloadで全Featureが消えWeb Storageを使用しない', async ({ page }) => {
    await openMap(page);
    for (const kind of ['marker', 'circle', 'line', 'polygon']) {
      await createShape(page, kind);
    }
    await page.reload();
    await page.locator('#map.leaflet-container').waitFor();

    expect((await getAppState(page)).mapProject.featureCollection.features).toEqual([]);
    expect(await page.evaluate(() => ({
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    }))).toEqual({ localStorage: 0, sessionStorage: 0 });
  });

  test('360px幅でtoolbarがviewport内に収まり操作可能', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openMap(page);
    const box = await page.locator('.leaflet-pm-toolbar').first().boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await expect(page.locator('.leaflet-pm-icon-marker')).toBeEnabled();
  });
});
