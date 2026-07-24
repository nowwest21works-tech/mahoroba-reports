const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const domain = require('../../../map-circles/js/domain.js');

const HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000001';
const JOURNEY_ID = '00000000-0000-4000-8000-000000000002';
const MAP_PROJECT_ID = '00000000-0000-4000-8000-000000000003';
const NOW = '2026-07-24T00:00:00.000Z';

function dependencies(id) {
  return {
    idGenerator: () => id,
    clock: () => NOW,
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

test('MapProjectは不正または非空のFeatureCollectionを拒否する', () => {
  const invalidCollections = [
    { type: 'Feature', features: [] },
    { type: 'FeatureCollection', features: {} },
    { type: 'FeatureCollection', features: [{ type: 'Feature' }] },
    { type: 'FeatureCollection', features: [], extra: true },
  ];

  for (const [index, featureCollection] of invalidCollections.entries()) {
    assert.throws(
      () => domain.createMapProject({
        journeyId: JOURNEY_ID,
        displayLabel: '条件整理マップ1',
        featureCollection,
      }, dependencies(MAP_PROJECT_ID)),
      index === invalidCollections.length - 1
        ? /MapProject\.extra/
        : /MapProject\.featureCollection/,
    );
  }
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
