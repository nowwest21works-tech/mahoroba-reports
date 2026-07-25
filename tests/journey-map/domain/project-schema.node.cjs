const test = require('node:test');
const assert = require('node:assert/strict');

const schema = require('../../../journey-map/js/project-schema.js');
const indexedDb = require('../../../journey-map/js/indexeddb-store.js');

const PROJECT_ID = '00000000-0000-4000-8000-000000000201';
const DUPLICATE_ID = '00000000-0000-4000-8000-000000000202';
const FEATURE_ID = '00000000-0000-4000-8000-000000000301';
const CREATED_AT = '2026-07-25T00:00:00.000Z';
const UPDATED_AT = '2026-07-25T01:00:00.000Z';

function projectInput() {
  return {
    householdCode: 'HH-001',
    journeyName: '土地探し 第1回',
    mapProjectName: '通勤圏・優先エリア整理',
    featureCollection: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: FEATURE_ID,
        geometry: {
          type: 'Point',
          coordinates: [136.8815, 35.1709],
        },
        properties: {
          schemaVersion: 1,
          kind: 'marker',
          label: '架空地点A',
        },
      }],
    },
    viewport: {
      center: { lat: 35.1709, lng: 136.8815 },
      zoom: 14,
    },
  };
}

function createRecord() {
  return schema.createRecord(projectInput(), {
    idGenerator: () => PROJECT_ID,
    clock: () => CREATED_AT,
  });
}

test('永続MapProject recordをUUIDとcanonical timestampで生成する', () => {
  const record = createRecord();

  assert.deepEqual(Object.keys(record), schema.RECORD_FIELDS);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.projectId, PROJECT_ID);
  assert.equal(record.createdAt, CREATED_AT);
  assert.equal(record.updatedAt, CREATED_AT);
  assert.equal(schema.validateRecord(record), true);
});

test('更新保存はprojectIdとcreatedAtを維持してupdatedAtだけを更新する', () => {
  const original = createRecord();
  const updated = schema.updateRecord(original, {
    ...projectInput(),
    mapProjectName: '優先エリア更新版',
  }, {
    clock: () => UPDATED_AT,
  });

  assert.equal(updated.projectId, PROJECT_ID);
  assert.equal(updated.createdAt, CREATED_AT);
  assert.equal(updated.updatedAt, UPDATED_AT);
  assert.equal(updated.mapProjectName, '優先エリア更新版');
  assert.equal(original.mapProjectName, '通勤圏・優先エリア整理');
});

test('複製は新しいprojectIdと日時を発行して地図内容をdeep cloneする', () => {
  const original = createRecord();
  const duplicate = schema.duplicateRecord(original, undefined, {
    idGenerator: () => DUPLICATE_ID,
    clock: () => UPDATED_AT,
  });

  assert.equal(duplicate.projectId, DUPLICATE_ID);
  assert.equal(duplicate.createdAt, UPDATED_AT);
  assert.equal(duplicate.updatedAt, UPDATED_AT);
  assert.equal(duplicate.mapProjectName, '通勤圏・優先エリア整理（複製）');
  assert.notEqual(duplicate.featureCollection, original.featureCollection);
});

test('schemaVersion、required field、UUID、timestamp、unknown fieldを検証する', () => {
  const record = createRecord();

  assert.throws(
    () => schema.validateRecord({ ...record, schemaVersion: 2 }),
    /schemaVersion/,
  );
  const missing = { ...record };
  delete missing.householdCode;
  assert.throws(() => schema.validateRecord(missing), /householdCode/);
  assert.throws(
    () => schema.validateRecord({ ...record, projectId: 'not-a-uuid' }),
    /projectId/,
  );
  assert.throws(
    () => schema.validateRecord({ ...record, updatedAt: '2026-07-25' }),
    /updatedAt/,
  );
  assert.throws(
    () => schema.validateRecord({ ...record, unexpectedNote: 'x' }),
    /unexpectedNote/,
  );
});

test('duplicate Feature IDとkind／geometry不整合を拒否する', () => {
  const record = createRecord();
  const duplicateFeature = JSON.parse(JSON.stringify(record.featureCollection.features[0]));
  assert.throws(
    () => schema.validateRecord({
      ...record,
      featureCollection: {
        type: 'FeatureCollection',
        features: [record.featureCollection.features[0], duplicateFeature],
      },
    }),
    /duplicate ID/,
  );

  assert.throws(
    () => schema.validateRecord({
      ...record,
      featureCollection: {
        type: 'FeatureCollection',
        features: [{
          ...record.featureCollection.features[0],
          properties: {
            schemaVersion: 1,
            kind: 'line',
            color: '#c8443a',
            label: '架空の線',
          },
        }],
      },
    }),
    /LineString/,
  );
});

test('JSONバックアップ名を匿名メタデータから安全に生成する', () => {
  assert.equal(
    schema.createBackupFilename(createRecord()),
    'HH-001_土地探し第1回_通勤圏・優先エリア整理.mahoroba-map.json',
  );
});

test('IndexedDB schemaは指定Database、Object Store、updatedAt indexを固定する', () => {
  assert.equal(indexedDb.DATABASE_NAME, 'mahorobaJourneyMaps');
  assert.equal(indexedDb.DATABASE_VERSION, 1);
  assert.equal(indexedDb.STORE_NAME, 'mapProjects');
  assert.equal(indexedDb.UPDATED_AT_INDEX, 'updatedAt');
});
