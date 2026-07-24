const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const adapter = require('../../../map-circles/js/geojson-adapter.js');

const FEATURE_ID = '00000000-0000-4000-8000-000000000101';
const FEATURE_ID_2 = '00000000-0000-4000-8000-000000000102';

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

test('Browser classic scriptは単一namespaceと既定UUID生成を提供する', () => {
  const domainSource = fs.readFileSync(
    path.resolve(__dirname, '../../../map-circles/js/domain.js'),
    'utf8',
  );
  const adapterSource = fs.readFileSync(
    path.resolve(__dirname, '../../../map-circles/js/geojson-adapter.js'),
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
});
