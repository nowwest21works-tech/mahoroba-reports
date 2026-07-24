const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const domain = require('../../../map-circles/js/domain.js');

const HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000001';
const JOURNEY_ID = '00000000-0000-4000-8000-000000000002';
const MAP_PROJECT_ID = '00000000-0000-4000-8000-000000000003';
const FEATURE_ID = '00000000-0000-4000-8000-000000000101';
const FEATURE_ID_2 = '00000000-0000-4000-8000-000000000102';
const FEATURE_ID_3 = '00000000-0000-4000-8000-000000000103';
const FEATURE_ID_4 = '00000000-0000-4000-8000-000000000104';
const NOW = '2026-07-24T00:00:00.000Z';

function dependencies(id) {
  return {
    idGenerator: () => id,
    clock: () => NOW,
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

function mapFeature(kind, id) {
  if (kind === 'circle') return { ...circleFeature(), id };
  if (kind === 'marker') {
    return {
      type: 'Feature',
      id,
      geometry: { type: 'Point', coordinates: [136.8815, 35.1709] },
      properties: { schemaVersion: 1, kind, label: '地点1' },
    };
  }
  if (kind === 'line') {
    return {
      type: 'Feature',
      id,
      geometry: {
        type: 'LineString',
        coordinates: [[136.8815, 35.1709], [136.8915, 35.1809]],
      },
      properties: {
        schemaVersion: 1,
        kind,
        color: '#c8443a',
        label: '線1',
      },
    };
  }
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [136.8815, 35.1709],
        [136.8915, 35.1709],
        [136.8915, 35.1809],
        [136.8815, 35.1709],
      ]],
    },
    properties: {
      schemaVersion: 1,
      kind,
      color: '#c8443a',
      label: '範囲1',
    },
  };
}

test('Householdをneutral displayCodeと差し替え可能なID／clockで生成する', () => {
  const input = { displayCode: 'HH-001' };
  const original = structuredClone(input);
  const household = domain.createHousehold(input, dependencies(HOUSEHOLD_ID));

  assert.deepEqual(household, {
    schemaVersion: 1,
    id: HOUSEHOLD_ID,
    displayCode: 'HH-001',
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.deepEqual(input, original);
  assert.equal(domain.validateHousehold(household), true);
  assert.deepEqual(JSON.parse(JSON.stringify(household)), household);
});

test('日時はcanonical UTC ISO-8601形式だけを許可する', () => {
  const household = domain.createHousehold(
    { displayCode: 'HH-001' },
    dependencies(HOUSEHOLD_ID),
  );
  assert.equal(domain.validateHousehold(household), true);

  const invalidTimestamps = [
    '2026-07-24',
    '2026-07-24T00:00:00Z',
    '2026-07-24T09:00:00.000+09:00',
    'July 24, 2026',
    '2026-02-30T00:00:00.000Z',
  ];

  for (const createdAt of invalidTimestamps) {
    assert.throws(
      () => domain.validateHousehold({ ...household, createdAt }),
      (error) => error.entity === 'Household'
        && error.field === 'createdAt'
        && error.message.includes('Household.createdAt')
        && error.message.includes('canonical UTC ISO-8601 timestamp'),
    );
  }
});

test('HouseholdはPII fieldとunknown fieldを明示的に拒否する', () => {
  const forbiddenFields = [
    'name',
    'customerName',
    'address',
    'homeAddress',
    'familyAddress',
    'workplace',
    'employer',
    'phone',
    'email',
    'unexpected',
  ];

  for (const field of forbiddenFields) {
    assert.throws(
      () => domain.createHousehold(
        { displayCode: 'HH-001', [field]: 'blocked' },
        dependencies(HOUSEHOLD_ID),
      ),
      (error) => error.entity === 'Household'
        && error.field === field
        && error.message.includes(`Household.${field}`),
    );
  }
});

test('HouseholdはneutralではないdisplayCodeを拒否する', () => {
  assert.throws(
    () => domain.createHousehold(
      { displayCode: '実名コード' },
      dependencies(HOUSEHOLD_ID),
    ),
    /Household\.displayCode/,
  );
});

test('Journeyをland_purchaseと3種類のstatusで生成する', () => {
  for (const status of ['active', 'paused', 'closed']) {
    const journey = domain.createJourney({
      householdId: HOUSEHOLD_ID,
      serviceType: 'land_purchase',
      displayLabel: '検討1',
      status,
    }, dependencies(JOURNEY_ID));

    assert.equal(journey.schemaVersion, 1);
    assert.equal(journey.id, JOURNEY_ID);
    assert.equal(journey.householdId, HOUSEHOLD_ID);
    assert.equal(journey.serviceType, 'land_purchase');
    assert.equal(journey.status, status);
    assert.equal(domain.validateJourney(journey), true);
  }
});

test('Journeyは不正serviceType、不正status、householdId欠落を拒否する', () => {
  assert.throws(
    () => domain.createJourney({
      householdId: HOUSEHOLD_ID,
      serviceType: 'sale',
      displayLabel: '検討1',
    }, dependencies(JOURNEY_ID)),
    /Journey\.serviceType/,
  );
  assert.throws(
    () => domain.createJourney({
      householdId: HOUSEHOLD_ID,
      displayLabel: '検討1',
      status: 'lead',
    }, dependencies(JOURNEY_ID)),
    /Journey\.status/,
  );
  assert.throws(
    () => domain.createJourney(
      { displayLabel: '検討1' },
      dependencies(JOURNEY_ID),
    ),
    /Journey\.householdId/,
  );
});

test('MapProjectを初期viewport、4種ハザード、空FeatureCollectionで生成する', () => {
  const mapProject = domain.createMapProject({
    journeyId: JOURNEY_ID,
    displayLabel: '条件整理マップ1',
  }, dependencies(MAP_PROJECT_ID));

  assert.deepEqual(mapProject.viewport, {
    center: { lat: 35.1709, lng: 136.8815 },
    zoom: 14,
  });
  assert.deepEqual(mapProject.hazardLayers, {
    flood: false,
    landslide: false,
    hightide: false,
    tsunami: false,
    opacity: 0.6,
  });
  assert.deepEqual(mapProject.featureCollection, {
    type: 'FeatureCollection',
    features: [],
  });
  assert.equal(domain.validateMapProject(mapProject), true);
});

test('MapProjectは有効なCircle Featureを保持し入力を変更しない', () => {
  const featureCollection = {
    type: 'FeatureCollection',
    features: [circleFeature()],
  };
  const original = structuredClone(featureCollection);
  const mapProject = domain.createMapProject({
    journeyId: JOURNEY_ID,
    displayLabel: '条件整理マップ1',
    featureCollection,
  }, dependencies(MAP_PROJECT_ID));

  assert.deepEqual(mapProject.featureCollection, featureCollection);
  assert.deepEqual(featureCollection, original);
  assert.equal(domain.validateMapProject(mapProject), true);
});

test('MapProjectはopacity範囲外を拒否する', () => {
  for (const opacity of [-0.1, 1.1, '0.6']) {
    assert.throws(
      () => domain.createMapProject({
        journeyId: JOURNEY_ID,
        displayLabel: '条件整理マップ1',
        hazardLayers: {
          flood: false,
          landslide: false,
          hightide: false,
          tsunami: false,
          opacity,
        },
      }, dependencies(MAP_PROJECT_ID)),
      /MapProject\.hazardLayers\.opacity/,
    );
  }
});

test('MapProjectはlat／lng／zoomの不正値を拒否する', () => {
  const invalidViewports = [
    { center: { lat: 91, lng: 136.8815 }, zoom: 14 },
    { center: { lat: 35.1709, lng: -181 }, zoom: 14 },
    { center: { lat: 35.1709, lng: 136.8815 }, zoom: 14.5 },
    { center: { lat: 35.1709, lng: 136.8815 }, zoom: 23 },
  ];

  for (const viewport of invalidViewports) {
    assert.throws(
      () => domain.createMapProject({
        journeyId: JOURNEY_ID,
        displayLabel: '条件整理マップ1',
        viewport,
      }, dependencies(MAP_PROJECT_ID)),
      /MapProject\.viewport/,
    );
  }
});

test('MapProjectは不正FeatureCollectionと無効なFeatureを拒否する', () => {
  const invalidCollections = [
    { type: 'Feature', features: [] },
    { type: 'FeatureCollection', features: {} },
    { type: 'FeatureCollection', features: [circleFeature({
      geometry: { type: 'Polygon' },
    })] },
    { type: 'FeatureCollection', features: [], extra: true },
  ];

  for (const featureCollection of invalidCollections) {
    assert.throws(
      () => domain.createMapProject({
        journeyId: JOURNEY_ID,
        displayLabel: '条件整理マップ1',
        featureCollection,
      }, dependencies(MAP_PROJECT_ID)),
      /MapProject\.featureCollection/,
    );
  }
});

test('MapProjectはduplicate Circle Feature IDを拒否する', () => {
  assert.throws(
    () => domain.createMapProject({
      journeyId: JOURNEY_ID,
      displayLabel: '条件整理マップ1',
      featureCollection: {
        type: 'FeatureCollection',
        features: [circleFeature(), circleFeature()],
      },
    }, dependencies(MAP_PROJECT_ID)),
    /MapProject\.featureCollection\.features\[1\]\.id: duplicate ID/,
  );
});

test('Mixed FeatureCollectionでCircle、Marker、Line、Polygonを保持する', () => {
  const featureCollection = {
    type: 'FeatureCollection',
    features: [
      mapFeature('circle', FEATURE_ID),
      mapFeature('marker', FEATURE_ID_2),
      mapFeature('line', FEATURE_ID_3),
      mapFeature('polygon', FEATURE_ID_4),
    ],
  };
  const original = structuredClone(featureCollection);
  assert.equal(domain.validateFeatureCollection(featureCollection), true);
  assert.deepEqual(featureCollection, original);
  assert.deepEqual(JSON.parse(JSON.stringify(featureCollection)), featureCollection);
});

test('MarkerはPointとlabelだけを許可する', () => {
  assert.equal(domain.validateMapFeature(mapFeature('marker', FEATURE_ID)), true);
  assert.throws(
    () => domain.validateMapFeature({
      ...mapFeature('marker', FEATURE_ID),
      properties: {
        ...mapFeature('marker', FEATURE_ID).properties,
        color: '#c8443a',
      },
    }),
    /MapFeature\.feature\.properties\.color/,
  );
  assert.throws(
    () => domain.validateMapFeature({
      ...mapFeature('marker', FEATURE_ID),
      geometry: { type: 'Point', coordinates: [181, 35] },
    }),
    /MapFeature\.feature\.geometry\.coordinates/,
  );
});

test('LineStringは2点以上の正しい座標だけを許可する', () => {
  assert.equal(domain.validateMapFeature(mapFeature('line', FEATURE_ID)), true);
  assert.throws(
    () => domain.validateMapFeature({
      ...mapFeature('line', FEATURE_ID),
      geometry: { type: 'LineString', coordinates: [[136.8815, 35.1709]] },
    }),
    /at least 2 positions/,
  );
  assert.throws(
    () => domain.validateMapFeature({
      ...mapFeature('line', FEATURE_ID),
      geometry: {
        type: 'LineString',
        coordinates: [[136.8815, 35.1709, 1], [136.8915, 35.1809]],
      },
    }),
    /must contain exactly \[lng, lat\]/,
  );
});

test('Polygonは閉じた単一outer ringだけを許可する', () => {
  assert.equal(domain.validateMapFeature(mapFeature('polygon', FEATURE_ID)), true);
  const polygon = mapFeature('polygon', FEATURE_ID);
  assert.throws(
    () => domain.validateMapFeature({
      ...polygon,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [136.8815, 35.1709],
          [136.8915, 35.1709],
          [136.8915, 35.1809],
        ]],
      },
    }),
    /at least 4 positions/,
  );
  assert.throws(
    () => domain.validateMapFeature({
      ...polygon,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [136.8815, 35.1709],
          [136.8915, 35.1709],
          [136.8915, 35.1809],
          [136.8816, 35.1709],
        ]],
      },
    }),
    /must be closed/,
  );
  assert.throws(
    () => domain.validateMapFeature({
      ...polygon,
      geometry: {
        type: 'Polygon',
        coordinates: [
          polygon.geometry.coordinates[0],
          polygon.geometry.coordinates[0],
        ],
      },
    }),
    /exactly 1 outer ring/,
  );
});

test('geometryとkindの不一致、MultiPolygon、unknown fieldを拒否する', () => {
  assert.throws(
    () => domain.validateMapFeature({
      ...mapFeature('line', FEATURE_ID),
      geometry: { type: 'Point', coordinates: [136.8815, 35.1709] },
    }),
    /must be LineString for line/,
  );
  assert.throws(
    () => domain.validateMapFeature({
      ...mapFeature('polygon', FEATURE_ID),
      geometry: { type: 'MultiPolygon', coordinates: [] },
    }),
    /must be Polygon for polygon/,
  );
  assert.throws(
    () => domain.validateMapFeature({
      ...mapFeature('marker', FEATURE_ID),
      extra: true,
    }),
    /MapFeature\.feature\.extra/,
  );
});

test('Browser classic scriptは単一MapCirclesDomain namespaceを公開する', () => {
  const sourcePath = path.resolve(__dirname, '../../../map-circles/js/domain.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const context = {
    crypto: { randomUUID: () => HOUSEHOLD_ID },
    Date,
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.equal(typeof context.MapCirclesDomain, 'object');
  assert.equal(typeof context.MapCirclesDomain.createHousehold, 'function');
  assert.equal(context.createHousehold, undefined);
});
