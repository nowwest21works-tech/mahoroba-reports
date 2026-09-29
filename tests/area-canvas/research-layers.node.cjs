const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const domain = require('../../area-canvas/js/research-layers-domain.js');
const terrainDomain = require('../../area-canvas/js/terrain-identify-domain.js');
const terrainIdentify = require('../../area-canvas/js/terrain-identify.js');
const elevationDomain = require('../../area-canvas/js/elevation-identify-domain.js');
const elevationIdentify = require('../../area-canvas/js/elevation-identify.js');

const manifestPath = path.join(__dirname, '../../area-canvas/data/research-layers/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

test('Public Research manifest has seven valid EVIDENCE layers with exact official endpoints', () => {
  const layers = domain.validateManifest(manifest);
  assert.deepEqual(layers.map((layer) => layer.id), [
    'landform-classification', 'meiji-lowland', 'seamless-geology',
    'gsi-hillshade', 'gsi-relief', 'gsi-slope', 'chubu-land-use',
  ]);
  assert.ok(layers.every((layer) => layer.authority === 'EVIDENCE' && layer.publicAllowed === true));
  assert.equal(layers.find((layer) => layer.id === 'seamless-geology').tileUrl,
    'https://gbank.gsj.jp/seamless/v2/api/1.3.1/tiles/{z}/{y}/{x}.png?layer=g');
  assert.ok(layers.every((layer) => layer.termsUrl.startsWith('https://')));
  assert.deepEqual(layers.find((layer) => layer.id === 'chubu-land-use').years, [1977, 1982, 1987, 1991, 1997]);
  assert.equal(domain.tileUrlForYear(layers.find((layer) => layer.id === 'chubu-land-use'), 1982),
    'https://cyberjapandata.gsi.go.jp/xyz/lum4bl_chubu1982/{z}/{x}/{y}.png');
});

test('invalid, incomplete, and unknown manifests fail closed', () => {
  assert.throws(() => domain.validateManifest(null));
  assert.throws(() => domain.validateManifest({ schemaVersion: 1, layers: [] }));
  const unknown = structuredClone(manifest);
  unknown.layers[0].id = 'unknown-layer';
  assert.throws(() => domain.validateManifest(unknown));
  const duplicate = structuredClone(manifest);
  duplicate.layers[1].id = duplicate.layers[0].id;
  assert.throws(() => domain.validateManifest(duplicate));
});

test('unknown layer, authority, public permission, zoom, and endpoint are rejected', () => {
  const layers = domain.validateManifest(manifest);
  assert.equal(domain.findLayer(layers, 'not-registered'), null);
  assert.equal(domain.supportsZoom(layers[0], 10), false);
  assert.equal(domain.supportsZoom(layers[0], 11), true);
  assert.equal(domain.supportsZoom(layers[0], 16), true);
  assert.equal(domain.supportsZoom(layers[0], 17), false);

  for (const [key, value] of [
    ['authority', 'RECONSTRUCTION'],
    ['publicAllowed', null],
    ['tileUrl', 'https://example.invalid/{z}/{x}/{y}.png'],
    ['termsUrl', 'https://example.invalid/terms'],
    ['minZoom', null],
    ['opacityDefault', 2],
  ]) {
    const invalid = structuredClone(manifest.layers[0]);
    invalid[key] = value;
    assert.throws(() => domain.validateLayer(invalid), key);
    assert.equal(domain.findLayer([invalid], invalid.id), null);
  }
});

test('tile health distinguishes loading, ready, partial, and all visible tiles failing', () => {
  assert.equal(domain.summarizeTileHealth({ pending: 2 }), 'LOADING');
  assert.equal(domain.summarizeTileHealth({ loaded: 2 }), 'READY');
  assert.equal(domain.summarizeTileHealth({ loaded: 1, failed: 1 }), 'PARTIAL');
  assert.equal(domain.summarizeTileHealth({ failed: 3 }), 'UNAVAILABLE');
  assert.equal(domain.summarizeTileHealth({ loaded: -1 }), 'UNAVAILABLE');
});

test('GSJ can upscale its native zoom through the map maximum; GSI range stays unchanged', () => {
  const layers = domain.validateManifest(manifest);
  const geology = layers.find((layer) => layer.id === 'seamless-geology');
  const landform = layers.find((layer) => layer.id === 'landform-classification');
  assert.equal(domain.canDisplayAtZoom(geology, 13, 18), true);
  assert.equal(domain.canDisplayAtZoom(geology, 14, 18), true);
  assert.equal(domain.canDisplayAtZoom(geology, 18, 18), true);
  assert.equal(domain.canDisplayAtZoom(geology, 19, 18), false);
  assert.equal(domain.canDisplayAtZoom(landform, 14, 18), true);
  assert.equal(domain.canDisplayAtZoom(landform, 17, 18), false);
});

test('Pack 02 zoom bounds and endpoints are allowlisted', () => {
  const layers = domain.validateManifest(manifest);
  const byId = Object.fromEntries(layers.map((layer) => [layer.id, layer]));
  assert.equal(domain.supportsZoom(byId['gsi-hillshade'], 2), true);
  assert.equal(domain.supportsZoom(byId['gsi-hillshade'], 17), false);
  assert.equal(domain.supportsZoom(byId['gsi-relief'], 5), true);
  assert.equal(domain.supportsZoom(byId['gsi-slope'], 16), false);
  for (const id of ['gsi-hillshade', 'gsi-relief', 'gsi-slope', 'chubu-land-use']) {
    const invalid = structuredClone(byId[id]);
    invalid.tileUrl = 'https://example.invalid/{z}/{x}/{y}.png';
    assert.throws(() => domain.validateLayer(invalid));
  }
});

test('land-use year is enum validated and invalid values fail closed', () => {
  const layer = domain.validateManifest(manifest).find((item) => item.id === 'chubu-land-use');
  for (const invalidYear of [1978, '1982x', null, {}, 2024]) assert.equal(domain.tileUrlForYear(layer, invalidYear), null);
  const invalidManifest = structuredClone(manifest);
  invalidManifest.layers.find((item) => item.id === 'chubu-land-use').years.push(2003);
  assert.throws(() => domain.validateManifest(invalidManifest));
});

test('official DEM PNG decode handles positive, negative, no-data, and invalid values', () => {
  assert.equal(elevationDomain.decodePixel(0, 3, 232), 10);
  assert.equal(elevationDomain.decodePixel(255, 255, 255), -0.01);
  assert.equal(elevationDomain.decodePixel(128, 0, 0), null);
  assert.equal(elevationDomain.decodePixel(0, 0, 0, 0), null);
  assert.equal(elevationDomain.decodePixel(999, 0, 0), null);
});

test('elevation identify uses official zoom candidates and fails closed when no value exists', async () => {
  const map = { project: (_point, zoom) => ({ x: zoom * 256 + 12.8, y: zoom * 256 + 34.9 }) };
  assert.deepEqual(elevationDomain.pixelFor(map, { lat: 35, lng: 136 }, 17), { x: 17, y: 17, pixelX: 12, pixelY: 34 });
  assert.equal(elevationDomain.tileUrl(elevationDomain.DEMS[0], { x: 17, y: 18 }),
    'https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/17/17/18.png');

  let requests = 0;
  const priorDocument = global.document;
  global.document = { createElement: () => ({
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: [128, 0, 0, 255] }) }),
  }) };
  let noData;
  try {
    noData = await elevationIdentify.identify(map, { lat: 35, lng: 136 }, {
      fetchImpl: async () => { requests += 1; return { status: 200, ok: true, blob: async () => ({}) }; },
      bitmapImpl: async () => ({ width: 256, height: 256, close() {} }),
    });
  } finally {
    if (priorDocument === undefined) delete global.document;
    else global.document = priorDocument;
  }
  assert.equal(noData.status, 'NO_DATA');
  assert.equal(noData.value, null);
  assert.equal(requests, 5);

  const unavailable = await elevationIdentify.identify(map, { lat: 35, lng: 136 }, { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(unavailable.status, 'UNAVAILABLE');
  assert.equal(unavailable.value, null);
});

test('GSI vector terrain identify uses official GeoJSON endpoints and official code mapping only', () => {
  const map = {
    getZoom: () => 14,
    project: () => ({ divideBy: () => ({ floor: () => ({ x: 14520, y: 6440 }) }) }),
  };
  assert.deepEqual(terrainDomain.tileUrl(map, { lat: 35, lng: 136 }, 14), [
    'https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification1/14/14520/6440.geojson',
    'https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification2/14/14520/6440.geojson',
  ]);
  assert.equal(terrainDomain.classifyCode('10503').name, '自然堤防');
  assert.equal(terrainDomain.classifyCode('not-a-code'), null);
  assert.equal(terrainDomain.classifyCode('99999').name, null);
});

test('GSI terrain identify checks polygon holes and fails closed on empty, broken, or unavailable tiles', async () => {
  const point = { lat: 35, lng: 136 };
  const map = {
    getZoom: () => 14,
    project: () => ({ divideBy: () => ({ floor: () => ({ x: 14520, y: 6440 }) }) }),
  };
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [[135, 34], [137, 34], [137, 36], [135, 36], [135, 34]],
      [[135.8, 34.8], [136.2, 34.8], [136.2, 35.2], [135.8, 35.2], [135.8, 34.8]],
    ],
  };
  assert.equal(terrainDomain.geometryContainsPoint(polygon, point), false);
  polygon.coordinates.pop();
  assert.equal(terrainDomain.geometryContainsPoint(polygon, point), true);

  const collection = { type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { code: '10503' }, geometry: polygon,
  }] };
  const okFetch = async () => ({ ok: true, json: async () => collection });
  const found = await terrainIdentify.identify(map, point, okFetch);
  assert.equal(found.status, 'READY');
  assert.equal(found.classification.name, '自然堤防');

  const empty = await terrainIdentify.identify(map, point, async () => ({
    ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }),
  }));
  assert.equal(empty.status, 'NO_FEATURE');
  const invalid = await terrainIdentify.identify(map, point, async () => ({ ok: true, json: async () => ({}) }));
  assert.equal(invalid.status, 'UNAVAILABLE');
  const unavailable = await terrainIdentify.identify(map, point, async () => { throw new Error('offline'); });
  assert.equal(unavailable.status, 'UNAVAILABLE');
  assert.equal(unavailable.classification, null);
});
