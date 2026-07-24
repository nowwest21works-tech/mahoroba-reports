const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const domain = require('../../../map-circles/js/domain.js');
const memoryStore = require('../../../map-circles/js/memory-store.js');

const HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000011';
const HOUSEHOLD_ID_2 = '00000000-0000-4000-8000-000000000012';
const JOURNEY_ID = '00000000-0000-4000-8000-000000000021';
const MAP_PROJECT_ID = '00000000-0000-4000-8000-000000000031';
const FEATURE_ID = '00000000-0000-4000-8000-000000000101';
const CREATED_AT = '2026-07-24T00:00:00.000Z';
const UPDATED_AT = '2026-07-24T00:01:00.000Z';

function sequence(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function createStore({
  ids = [HOUSEHOLD_ID, JOURNEY_ID, MAP_PROJECT_ID],
  times = [CREATED_AT],
} = {}) {
  return memoryStore.createMemoryStore({
    idGenerator: sequence(ids),
    clock: sequence(times),
  });
}

function seedStore(store) {
  const household = store.createHousehold({ displayCode: 'HH-001' });
  const journey = store.createJourney({
    householdId: household.id,
    displayLabel: '検討1',
  });
  const mapProject = store.createMapProject({
    journeyId: journey.id,
    displayLabel: '条件整理マップ1',
  });
  return { household, journey, mapProject };
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

test('Household CRUDを実行し、updatedAtを更新する', () => {
  const store = createStore({
    ids: [HOUSEHOLD_ID],
    times: [CREATED_AT, UPDATED_AT],
  });
  const created = store.createHousehold({ displayCode: 'HH-001' });
  assert.deepEqual(store.getHousehold(created.id), created);
  assert.deepEqual(store.listHouseholds(), [created]);

  const updated = store.updateHousehold(created.id, { displayCode: 'HH-002' });
  assert.equal(updated.displayCode, 'HH-002');
  assert.equal(updated.createdAt, CREATED_AT);
  assert.equal(updated.updatedAt, UPDATED_AT);
  assert.equal(store.removeHousehold(created.id), true);
  assert.equal(store.getHousehold(created.id), null);
  assert.equal(store.removeHousehold(created.id), false);
});

test('JourneyとMapProjectのCRUDを実行する', () => {
  const store = createStore({
    times: [CREATED_AT, CREATED_AT, CREATED_AT, UPDATED_AT, UPDATED_AT],
  });
  const { journey, mapProject } = seedStore(store);

  const updatedJourney = store.updateJourney(journey.id, {
    displayLabel: '検討2',
    status: 'paused',
  });
  assert.equal(updatedJourney.displayLabel, '検討2');
  assert.equal(updatedJourney.status, 'paused');

  const updatedMapProject = store.updateMapProject(mapProject.id, {
    displayLabel: '条件整理マップ2',
    viewport: {
      center: { lat: 35, lng: 137 },
      zoom: 15,
    },
  });
  assert.equal(updatedMapProject.displayLabel, '条件整理マップ2');
  assert.equal(updatedMapProject.viewport.zoom, 15);
  assert.equal(store.listJourneys().length, 1);
  assert.equal(store.listMapProjects().length, 1);
});

test('duplicate IDを拒否する', () => {
  const store = createStore({
    ids: [HOUSEHOLD_ID, HOUSEHOLD_ID],
    times: [CREATED_AT, CREATED_AT],
  });
  store.createHousehold({ displayCode: 'HH-001' });
  assert.throws(
    () => store.createHousehold({ displayCode: 'HH-002' }),
    /Household\.id: duplicate ID/,
  );
});

test('親entityが存在しないJourneyとMapProjectの作成を拒否する', () => {
  const journeyStore = createStore({ ids: [JOURNEY_ID] });
  assert.throws(
    () => journeyStore.createJourney({
      householdId: HOUSEHOLD_ID,
      displayLabel: '検討1',
    }),
    /Journey\.householdId: referenced Household not found/,
  );

  const projectStore = createStore({ ids: [MAP_PROJECT_ID] });
  assert.throws(
    () => projectStore.createMapProject({
      journeyId: JOURNEY_ID,
      displayLabel: '条件整理マップ1',
    }),
    /MapProject\.journeyId: referenced Journey not found/,
  );
});

test('relationがある親entityをrestrictし、cascade deleteしない', () => {
  const store = createStore();
  const { household, journey, mapProject } = seedStore(store);

  assert.throws(
    () => store.removeHousehold(household.id),
    /Household\.id: cannot remove while Journey children exist/,
  );
  assert.throws(
    () => store.removeJourney(journey.id),
    /Journey\.id: cannot remove while MapProject children exist/,
  );
  assert.equal(store.getJourney(journey.id).id, journey.id);
  assert.equal(store.getMapProject(mapProject.id).id, mapProject.id);

  assert.equal(store.removeMapProject(mapProject.id), true);
  assert.equal(store.removeJourney(journey.id), true);
  assert.equal(store.removeHousehold(household.id), true);
});

test('Storeへの入力と返却値をdeep cloneする', () => {
  const store = createStore();
  const household = store.createHousehold({ displayCode: 'HH-001' });
  const journey = store.createJourney({
    householdId: household.id,
    displayLabel: '検討1',
  });
  const input = {
    journeyId: journey.id,
    displayLabel: '条件整理マップ1',
    viewport: {
      center: { lat: 35.1709, lng: 136.8815 },
      zoom: 14,
    },
    hazardLayers: {
      flood: false,
      landslide: false,
      hightide: false,
      tsunami: false,
      opacity: 0.6,
    },
    featureCollection: {
      type: 'FeatureCollection',
      features: [],
    },
  };
  const created = store.createMapProject(input);

  input.viewport.center.lat = 0;
  created.viewport.center.lat = 1;
  const firstRead = store.getMapProject(created.id);
  firstRead.hazardLayers.opacity = 0;
  const secondRead = store.getMapProject(created.id);

  assert.equal(secondRead.viewport.center.lat, 35.1709);
  assert.equal(secondRead.hazardLayers.opacity, 0.6);
});

test('MapProjectを有効なCircle FeatureCollectionで更新しdeep cloneする', () => {
  const store = createStore();
  const { mapProject } = seedStore(store);
  const featureCollection = {
    type: 'FeatureCollection',
    features: [circleFeature()],
  };
  const updated = store.updateMapProject(mapProject.id, { featureCollection });

  featureCollection.features[0].geometry.coordinates[0] = 0;
  updated.featureCollection.features[0].properties.label = '変更済み';
  const stored = store.getMapProject(mapProject.id);
  assert.equal(stored.featureCollection.features[0].geometry.coordinates[0], 136.8815);
  assert.equal(stored.featureCollection.features[0].properties.label, '地点1');
});

test('MapProjectの無効なCircle FeatureCollection更新を拒否する', () => {
  const store = createStore();
  const { mapProject } = seedStore(store);
  assert.throws(
    () => store.updateMapProject(mapProject.id, {
      featureCollection: {
        type: 'FeatureCollection',
        features: [circleFeature({
          properties: { radiusMeters: 50001 },
        })],
      },
    }),
    /MapProject\.featureCollection\.features\[0\]\.properties\.radiusMeters/,
  );
  assert.deepEqual(
    store.getMapProject(mapProject.id).featureCollection,
    { type: 'FeatureCollection', features: [] },
  );
});

test('snapshotはrelation全体のdeep cloneを返す', () => {
  const store = createStore();
  seedStore(store);
  const snapshot = store.snapshot();

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.households.length, 1);
  assert.equal(snapshot.journeys.length, 1);
  assert.equal(snapshot.mapProjects.length, 1);

  snapshot.households[0].displayCode = 'HH-999';
  snapshot.mapProjects[0].viewport.zoom = 1;
  assert.equal(store.listHouseholds()[0].displayCode, 'HH-001');
  assert.equal(store.listMapProjects()[0].viewport.zoom, 14);
});

test('id、createdAt、updatedAt、親IDの更新を拒否する', () => {
  const store = createStore({
    times: [CREATED_AT, CREATED_AT, CREATED_AT, UPDATED_AT],
  });
  const { household, journey, mapProject } = seedStore(store);
  const cases = [
    () => store.updateHousehold(household.id, { id: HOUSEHOLD_ID_2 }),
    () => store.updateHousehold(household.id, { createdAt: UPDATED_AT }),
    () => store.updateHousehold(household.id, { updatedAt: UPDATED_AT }),
    () => store.updateJourney(journey.id, { householdId: HOUSEHOLD_ID_2 }),
    () => store.updateMapProject(mapProject.id, { journeyId: MAP_PROJECT_ID }),
  ];

  for (const mutate of cases) {
    assert.throws(mutate, /is immutable/);
  }
});

test('unknown fieldとPII fieldのStore入力を保持しない', () => {
  const store = createStore({ ids: [HOUSEHOLD_ID] });
  assert.throws(
    () => store.createHousehold({
      displayCode: 'HH-001',
      customerName: 'blocked',
    }),
    /Household\.customerName/,
  );
  assert.deepEqual(store.listHouseholds(), []);
});

test('Browser classic scriptは単一MapCirclesMemoryStore namespaceを公開する', () => {
  const domainSource = fs.readFileSync(
    path.resolve(__dirname, '../../../map-circles/js/domain.js'),
    'utf8',
  );
  const storeSource = fs.readFileSync(
    path.resolve(__dirname, '../../../map-circles/js/memory-store.js'),
    'utf8',
  );
  const context = {
    crypto: { randomUUID: sequence([HOUSEHOLD_ID]) },
    Date,
  };
  vm.createContext(context);
  vm.runInContext(domainSource, context);
  vm.runInContext(storeSource, context);

  assert.equal(typeof context.MapCirclesMemoryStore, 'object');
  assert.equal(typeof context.MapCirclesMemoryStore.createMemoryStore, 'function');
  assert.equal(context.createMemoryStore, undefined);
  assert.equal(typeof domain.createHousehold, 'function');
});
