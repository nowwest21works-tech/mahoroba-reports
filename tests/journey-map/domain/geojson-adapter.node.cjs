const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const adapter = require('../../../journey-map/js/geojson-adapter.js');

const FEATURE_ID = '00000000-0000-4000-8000-000000000101';
const FEATURE_ID_2 = '00000000-0000-4000-8000-000000000102';
const FEATURE_ID_3 = '00000000-0000-4000-8000-000000000103';
const FEATURE_ID_4 = '00000000-0000-4000-8000-000000000104';

function circleRecord(overrides = {}) {
  return {
    center: [35.1709, 136.8815],
    radius: 800,
    color: '#c8443a',
    label: '地点1',
    ...overrides,
  };
}

function circleFeature(overrides = {}) {
  const feature = {
    type: 'Feature',
    id: FEATURE_ID,
    geometry: {
      type: 'Point',
      coordinates: [136.8815, 35.1709],
    },
    properties: {
      schemaVersion: 1,
      kind: 'circle',
      radiusMeters: 800,
      color: '#c8443a',
      label: '地点1',
    },
  };
  return {
    ...feature,
    ...overrides,
    geometry: {
      ...feature.geometry,
      ...(overrides.geometry || {}),
    },
    properties: {
      ...feature.properties,
      ...(overrides.properties || {}),
    },
  };
}

test('circle recordを座標順序変換してFeatureへ変換する', () => {
  const input = circleRecord();
  const original = structuredClone(input);
  const feature = adapter.circleRecordToFeature(input, {
    idGenerator: () => FEATURE_ID,
  });

  assert.deepEqual(feature, circleFeature());
  assert.deepEqual(input, original);
  assert.equal(adapter.validateCircleFeature(feature), true);
  assert.deepEqual(JSON.parse(JSON.stringify(feature)), feature);
});

test('Featureをfeature IDを維持したcircle recordへ変換する', () => {
  const feature = circleFeature();
  const record = adapter.featureToCircleRecord(feature);

  assert.deepEqual(record, {
    featureId: FEATURE_ID,
    center: [35.1709, 136.8815],
    radius: 800,
    color: '#c8443a',
    label: '地点1',
  });
  record.center[0] = 0;
  assert.equal(feature.geometry.coordinates[1], 35.1709);
});

test('recordとFeatureのround-tripで値とIDを維持する', () => {
  const record = circleRecord({ featureId: FEATURE_ID });
  const feature = adapter.circleRecordToFeature(record);
  const restored = adapter.featureToCircleRecord(feature);
  assert.deepEqual(restored, record);
});

test('複数円をFeatureCollectionへ変換しdeep cloneする', () => {
  const records = [
    circleRecord({ featureId: FEATURE_ID }),
    circleRecord({
      featureId: FEATURE_ID_2,
      center: [35, 137],
      radius: 1000,
      color: '#3a8c5f',
      label: '地点2',
    }),
  ];
  const featureCollection = adapter.circleRecordsToFeatureCollection(records);
  assert.equal(featureCollection.type, 'FeatureCollection');
  assert.equal(featureCollection.features.length, 2);

  const restored = adapter.featureCollectionToCircleRecords(featureCollection);
  assert.deepEqual(restored, records);
  restored[0].center[0] = 0;
  assert.equal(featureCollection.features[0].geometry.coordinates[1], 35.1709);
});

test('複数円変換でもinjected UUID generatorを使用する', () => {
  const ids = [FEATURE_ID, FEATURE_ID_2];
  const featureCollection = adapter.circleRecordsToFeatureCollection(
    [circleRecord(), circleRecord({ label: '地点2' })],
    { idGenerator: () => ids.shift() },
  );
  assert.deepEqual(
    featureCollection.features.map((feature) => feature.id),
    [FEATURE_ID, FEATURE_ID_2],
  );
});

test('不正Featureと不正geometryを拒否する', () => {
  const invalidFeatures = [
    circleFeature({ type: 'Marker' }),
    circleFeature({ geometry: { type: 'LineString' } }),
    circleFeature({ geometry: { coordinates: [136.8815] } }),
    circleFeature({ geometry: { coordinates: [181, 35.1709] } }),
    circleFeature({ geometry: { coordinates: [136.8815, 91] } }),
    circleFeature({ geometry: { coordinates: [Number.NaN, 35.1709] } }),
  ];
  for (const feature of invalidFeatures) {
    assert.throws(() => adapter.validateCircleFeature(feature), /CircleFeature\.feature/);
  }
});

test('不正radius、color、空labelを拒否する', () => {
  const invalidFeatures = [
    circleFeature({ properties: { radiusMeters: 49 } }),
    circleFeature({ properties: { radiusMeters: 50001 } }),
    circleFeature({ properties: { radiusMeters: Number.POSITIVE_INFINITY } }),
    circleFeature({ properties: { color: 'red' } }),
    circleFeature({ properties: { color: '#12345g' } }),
    circleFeature({ properties: { label: '   ' } }),
  ];
  for (const feature of invalidFeatures) {
    assert.throws(() => adapter.validateCircleFeature(feature), /CircleFeature\.feature\.properties/);
  }
});

test('Feature、geometry、properties、recordのunknown fieldを拒否する', () => {
  assert.throws(
    () => adapter.validateCircleFeature({ ...circleFeature(), extra: true }),
    /CircleFeature\.feature\.extra/,
  );
  assert.throws(
    () => adapter.validateCircleFeature(circleFeature({
      geometry: { extra: true },
    })),
    /CircleFeature\.feature\.geometry\.extra/,
  );
  assert.throws(
    () => adapter.validateCircleFeature(circleFeature({
      properties: { extra: true },
    })),
    /CircleFeature\.feature\.properties\.extra/,
  );
  assert.throws(
    () => adapter.circleRecordToFeature({
      ...circleRecord(),
      extra: true,
    }),
    /CircleRecord\.extra/,
  );
});

test('duplicate Feature IDを拒否する', () => {
  assert.throws(
    () => adapter.circleRecordsToFeatureCollection([
      circleRecord({ featureId: FEATURE_ID }),
      circleRecord({ featureId: FEATURE_ID }),
    ]),
    /MapProject\.featureCollection\.features\[1\]\.id: duplicate ID/,
  );
});

test('Marker、Line、Polygonを座標順序変換してround-tripする', () => {
  const records = [
    {
      kind: 'marker',
      featureId: FEATURE_ID,
      center: [35.1709, 136.8815],
      label: '地点1',
    },
    {
      kind: 'line',
      featureId: FEATURE_ID_2,
      points: [[35.1709, 136.8815], [35.1809, 136.8915]],
      color: '#c8443a',
      label: '線1',
    },
    {
      kind: 'polygon',
      featureId: FEATURE_ID_3,
      rings: [[
        [35.1709, 136.8815],
        [35.1709, 136.8915],
        [35.1809, 136.8915],
        [35.1709, 136.8815],
      ]],
      color: '#c8443a',
      label: '範囲1',
    },
  ];
  const original = structuredClone(records);

  for (const record of records) {
    const feature = adapter.shapeRecordToFeature(record);
    assert.equal(adapter.validateMapFeature(feature), true);
    assert.deepEqual(adapter.featureToShapeRecord(feature), record);
  }
  assert.deepEqual(records, original);
  assert.deepEqual(
    adapter.shapeRecordToFeature(records[1]).geometry.coordinates,
    [[136.8815, 35.1709], [136.8915, 35.1809]],
  );
});

test('Mixed shape recordsとFeatureCollectionをdeep cloneして往復する', () => {
  const records = [
    {
      kind: 'circle',
      featureId: FEATURE_ID,
      center: [35.1709, 136.8815],
      radius: 800,
      color: '#c8443a',
      label: '地点1',
    },
    {
      kind: 'marker',
      featureId: FEATURE_ID_2,
      center: [35.18, 136.89],
      label: '地点2',
    },
    {
      kind: 'line',
      featureId: FEATURE_ID_3,
      points: [[35.17, 136.88], [35.18, 136.89]],
      color: '#3a8c5f',
      label: '線1',
    },
    {
      kind: 'polygon',
      featureId: FEATURE_ID_4,
      rings: [[
        [35.17, 136.88],
        [35.17, 136.89],
        [35.18, 136.89],
        [35.17, 136.88],
      ]],
      color: '#7a4e9c',
      label: '範囲1',
    },
  ];
  const featureCollection = adapter.shapeRecordsToFeatureCollection(records);
  const restored = adapter.featureCollectionToShapeRecords(featureCollection);

  assert.deepEqual(restored, records);
  restored[1].center[0] = 0;
  assert.equal(featureCollection.features[1].geometry.coordinates[1], 35.18);
});

test('shape APIはID generatorを差し替え、invalid／unknown fieldを拒否する', () => {
  const marker = {
    kind: 'marker',
    center: [35.1709, 136.8815],
    label: '地点1',
  };
  assert.equal(
    adapter.shapeRecordToFeature(marker, {
      idGenerator: () => FEATURE_ID,
    }).id,
    FEATURE_ID,
  );
  assert.throws(
    () => adapter.shapeRecordToFeature({ ...marker, extra: true }),
    /CircleRecord\.extra/,
  );
  assert.throws(
    () => adapter.shapeRecordToFeature({
      kind: 'line',
      points: [[35.1709, 136.8815]],
      color: '#c8443a',
      label: '線1',
    }, { idGenerator: () => FEATURE_ID }),
    /MapFeature\.feature\.geometry\.coordinates/,
  );
});

test('Browser classic scriptは単一namespaceと既定UUID生成を提供する', () => {
  const domainSource = fs.readFileSync(
    path.resolve(__dirname, '../../../journey-map/js/domain.js'),
    'utf8',
  );
  const adapterSource = fs.readFileSync(
    path.resolve(__dirname, '../../../journey-map/js/geojson-adapter.js'),
    'utf8',
  );
  const context = {
    crypto: { randomUUID: () => FEATURE_ID },
    Date,
  };
  vm.createContext(context);
  vm.runInContext(domainSource, context);
  vm.runInContext(adapterSource, context);

  const feature = context.MapCirclesGeoJsonAdapter.circleRecordToFeature(
    vm.runInContext(`({
      center: [35.1709, 136.8815],
      radius: 800,
      color: "#c8443a",
      label: "地点1"
    })`, context),
  );
  assert.equal(feature.id, FEATURE_ID);
  assert.equal(typeof context.MapCirclesGeoJsonAdapter, 'object');
  assert.equal(context.circleRecordToFeature, undefined);
  assert.equal(typeof adapter.circleRecordToFeature, 'function');
  assert.equal(typeof context.MapCirclesGeoJsonAdapter.shapeRecordToFeature, 'function');
  assert.equal(typeof adapter.shapeRecordToFeature, 'function');
});
