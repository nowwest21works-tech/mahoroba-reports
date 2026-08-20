(function (root, factory) {
  const domain = typeof module === 'object' && module.exports
    ? require('./domain.js')
    : root.MapCirclesDomain;
  const api = factory(root, domain);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JourneyMapProjectSchema = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, domain) {
  'use strict';

  if (!domain) {
    throw new Error('JourneyMapProjectSchema.domain: MapCirclesDomain is required');
  }

  const SCHEMA_VERSION = 1;
  const RECORD_FIELDS = Object.freeze([
    'schemaVersion',
    'projectId',
    'householdCode',
    'journeyName',
    'mapProjectName',
    'featureCollection',
    'viewport',
    'createdAt',
    'updatedAt',
  ]);
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ISO_TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  class ProjectValidationError extends Error {
    constructor(field, message) {
      super(`地図データの「${field}」が不正です：${message}`);
      this.name = 'ProjectValidationError';
      this.field = field;
    }
  }

  function fail(field, message) {
    throw new ProjectValidationError(field, message);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cloneData(value) {
    if (Array.isArray(value)) return value.map(cloneData);
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneData(item)]),
      );
    }
    return value;
  }

  function assertPlainObject(field, value) {
    if (!isPlainObject(value)) fail(field, 'オブジェクトである必要があります');
  }

  function assertExactFields(value) {
    const unknownFields = Object.keys(value).filter(
      (field) => !RECORD_FIELDS.includes(field),
    );
    if (unknownFields.length > 0) {
      fail(unknownFields[0], '未対応の項目です');
    }
    for (const field of RECORD_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail(field, '必須項目です');
      }
    }
  }

  function assertNonEmptyString(field, value) {
    if (typeof value !== 'string' || value.trim() === '') {
      fail(field, '空欄にはできません');
    }
    if (value.length > 120) {
      fail(field, '120文字以内で入力してください');
    }
  }

  function assertUuid(field, value) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      fail(field, 'UUID形式である必要があります');
    }
  }

  function assertCanonicalTimestamp(field, value) {
    if (
      typeof value !== 'string'
      || !ISO_TIMESTAMP_PATTERN.test(value)
      || Number.isNaN(Date.parse(value))
      || new Date(value).toISOString() !== value
    ) {
      fail(field, 'UTC ISO-8601形式である必要があります');
    }
  }

  function validateViewport(viewport) {
    assertPlainObject('viewport', viewport);
    const fields = Object.keys(viewport);
    if (
      fields.length !== 2
      || !fields.includes('center')
      || !fields.includes('zoom')
    ) {
      fail('viewport', 'centerとzoomだけを指定してください');
    }

    assertPlainObject('viewport.center', viewport.center);
    const centerFields = Object.keys(viewport.center);
    if (
      centerFields.length !== 2
      || !centerFields.includes('lat')
      || !centerFields.includes('lng')
    ) {
      fail('viewport.center', 'latとlngだけを指定してください');
    }
    if (
      typeof viewport.center.lat !== 'number'
      || !Number.isFinite(viewport.center.lat)
      || viewport.center.lat < -90
      || viewport.center.lat > 90
    ) {
      fail('viewport.center.lat', '-90〜90の数値である必要があります');
    }
    if (
      typeof viewport.center.lng !== 'number'
      || !Number.isFinite(viewport.center.lng)
      || viewport.center.lng < -180
      || viewport.center.lng > 180
    ) {
      fail('viewport.center.lng', '-180〜180の数値である必要があります');
    }
    if (
      !Number.isInteger(viewport.zoom)
      || viewport.zoom < 0
      || viewport.zoom > 22
    ) {
      fail('viewport.zoom', '0〜22の整数である必要があります');
    }
  }

  function validateRecord(value) {
    assertPlainObject('record', value);
    assertExactFields(value);
    if (value.schemaVersion !== SCHEMA_VERSION) {
      fail('schemaVersion', `対応versionは${SCHEMA_VERSION}です`);
    }
    assertUuid('projectId', value.projectId);
    assertNonEmptyString('householdCode', value.householdCode);
    if (!/^HH-\d{3,}$/.test(value.householdCode)) {
      fail('householdCode', 'HH-001形式で入力してください');
    }
    assertNonEmptyString('journeyName', value.journeyName);
    assertNonEmptyString('mapProjectName', value.mapProjectName);
    try {
      domain.validateFeatureCollection(value.featureCollection);
    } catch (error) {
      fail('featureCollection', error.message);
    }
    validateViewport(value.viewport);
    assertCanonicalTimestamp('createdAt', value.createdAt);
    assertCanonicalTimestamp('updatedAt', value.updatedAt);
    if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
      fail('updatedAt', 'createdAt以降である必要があります');
    }
    return true;
  }

  function defaultIdGenerator() {
    if (root && root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID();
    }
    throw new Error('crypto.randomUUID is unavailable');
  }

  function defaultClock() {
    return new Date().toISOString();
  }

  function resolveOptions(options) {
    const value = options === undefined ? {} : options;
    assertPlainObject('options', value);
    const unknownFields = Object.keys(value).filter(
      (field) => !['idGenerator', 'clock'].includes(field),
    );
    if (unknownFields.length > 0) fail(`options.${unknownFields[0]}`, '未対応の項目です');
    return {
      idGenerator: value.idGenerator || defaultIdGenerator,
      clock: value.clock || defaultClock,
    };
  }

  function createRecord(input, options) {
    const dependencies = resolveOptions(options);
    const timestamp = dependencies.clock();
    const record = {
      schemaVersion: SCHEMA_VERSION,
      projectId: dependencies.idGenerator(),
      householdCode: input.householdCode,
      journeyName: input.journeyName,
      mapProjectName: input.mapProjectName,
      featureCollection: cloneData(input.featureCollection),
      viewport: cloneData(input.viewport),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    validateRecord(record);
    return record;
  }

  function updateRecord(current, input, options) {
    validateRecord(current);
    const dependencies = resolveOptions(options);
    const record = {
      ...cloneData(current),
      householdCode: input.householdCode,
      journeyName: input.journeyName,
      mapProjectName: input.mapProjectName,
      featureCollection: cloneData(input.featureCollection),
      viewport: cloneData(input.viewport),
      updatedAt: dependencies.clock(),
    };
    validateRecord(record);
    return record;
  }

  function duplicateRecord(current, input, options) {
    validateRecord(current);
    const dependencies = resolveOptions(options);
    const timestamp = dependencies.clock();
    const record = {
      ...cloneData(current),
      projectId: dependencies.idGenerator(),
      mapProjectName: input && input.mapProjectName
        ? input.mapProjectName
        : `${current.mapProjectName}（複製）`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    validateRecord(record);
    return record;
  }

  function createBackupFilename(record) {
    validateRecord(record);
    const safePart = (value) => value
      .trim()
      .replace(/\s+/g, '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .slice(0, 60);
    return [
      safePart(record.householdCode),
      safePart(record.journeyName),
      safePart(record.mapProjectName),
    ].join('_') + '.mahoroba-map.json';
  }

  return Object.freeze({
    ProjectValidationError,
    RECORD_FIELDS,
    SCHEMA_VERSION,
    createBackupFilename,
    createRecord,
    duplicateRecord,
    updateRecord,
    validateRecord,
  });
});
