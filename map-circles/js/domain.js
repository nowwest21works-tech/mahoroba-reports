(function (root, factory) {
  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MapCirclesDomain = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const SERVICE_TYPE = 'land_purchase';
  const JOURNEY_STATUSES = Object.freeze(['active', 'paused', 'closed']);
  const DEFAULT_VIEWPORT = Object.freeze({
    center: Object.freeze({ lat: 35.1709, lng: 136.8815 }),
    zoom: 14,
  });
  const DEFAULT_HAZARD_LAYERS = Object.freeze({
    flood: false,
    landslide: false,
    hightide: false,
    tsunami: false,
    opacity: 0.6,
  });
  const ISO_TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  class ValidationError extends Error {
    constructor(entity, field, message) {
      super(`${entity}.${field}: ${message}`);
      this.name = 'ValidationError';
      this.entity = entity;
      this.field = field;
    }
  }

  function fail(entity, field, message) {
    throw new ValidationError(entity, field, message);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function assertPlainObject(entity, field, value) {
    if (!isPlainObject(value)) fail(entity, field, 'must be a plain object');
  }

  function fieldPath(prefix, field) {
    return prefix ? `${prefix}.${field}` : field;
  }

  function assertAllowedFields(entity, value, allowedFields, prefix = '') {
    for (const field of Object.keys(value)) {
      if (!allowedFields.includes(field)) {
        fail(entity, fieldPath(prefix, field), 'is not allowed');
      }
    }
  }

  function assertRequiredFields(entity, value, requiredFields, prefix = '') {
    for (const field of requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        fail(entity, fieldPath(prefix, field), 'is required');
      }
    }
  }

  function assertNonEmptyString(entity, field, value) {
    if (typeof value !== 'string' || value.trim() === '') {
      fail(entity, field, 'must be a non-empty string');
    }
  }

  function assertUuid(entity, field, value) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      fail(entity, field, 'must be a UUID');
    }
  }

  function assertIsoTimestamp(entity, field, value) {
    if (
      typeof value !== 'string'
      || !ISO_TIMESTAMP_PATTERN.test(value)
      || Number.isNaN(Date.parse(value))
      || new Date(value).toISOString() !== value
    ) {
      fail(entity, field, 'must be a canonical UTC ISO-8601 timestamp');
    }
  }

  function assertFiniteNumber(entity, field, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(entity, field, 'must be a finite number');
    }
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

  function defaultIdGenerator() {
    if (root && root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID();
    }
    throw new Error('crypto.randomUUID is unavailable');
  }

  function defaultClock() {
    return new Date().toISOString();
  }

  function resolveDependencies(entity, options) {
    const value = options === undefined ? {} : options;
    assertPlainObject(entity, 'options', value);
    assertAllowedFields(entity, value, ['idGenerator', 'clock']);

    const idGenerator = value.idGenerator || defaultIdGenerator;
    const clock = value.clock || defaultClock;

    if (typeof idGenerator !== 'function') {
      fail(entity, 'idGenerator', 'must be a function');
    }
    if (typeof clock !== 'function') {
      fail(entity, 'clock', 'must be a function');
    }

    return { idGenerator, clock };
  }

  function createIdentity(entity, options) {
    const dependencies = resolveDependencies(entity, options);
    let id;
    let timestamp;

    try {
      id = dependencies.idGenerator(entity);
    } catch (error) {
      fail(entity, 'id', `generation failed: ${error.message}`);
    }
    try {
      timestamp = dependencies.clock();
    } catch (error) {
      fail(entity, 'createdAt', `clock failed: ${error.message}`);
    }

    assertUuid(entity, 'id', id);
    assertIsoTimestamp(entity, 'createdAt', timestamp);
    return { id, timestamp };
  }

  function validateHousehold(value) {
    const entity = 'Household';
    assertPlainObject(entity, 'entity', value);
    const fields = ['schemaVersion', 'id', 'displayCode', 'createdAt', 'updatedAt'];
    assertAllowedFields(entity, value, fields);
    assertRequiredFields(entity, value, fields);

    if (value.schemaVersion !== SCHEMA_VERSION) {
      fail(entity, 'schemaVersion', `must be ${SCHEMA_VERSION}`);
    }
    assertUuid(entity, 'id', value.id);
    assertNonEmptyString(entity, 'displayCode', value.displayCode);
    if (!/^HH-\d{3,}$/.test(value.displayCode)) {
      fail(entity, 'displayCode', 'must use the neutral HH-001 format');
    }
    assertIsoTimestamp(entity, 'createdAt', value.createdAt);
    assertIsoTimestamp(entity, 'updatedAt', value.updatedAt);
    return true;
  }

  function validateJourney(value) {
    const entity = 'Journey';
    assertPlainObject(entity, 'entity', value);
    const fields = [
      'schemaVersion',
      'id',
      'householdId',
      'serviceType',
      'displayLabel',
      'status',
      'createdAt',
      'updatedAt',
    ];
    assertAllowedFields(entity, value, fields);
    assertRequiredFields(entity, value, fields);

    if (value.schemaVersion !== SCHEMA_VERSION) {
      fail(entity, 'schemaVersion', `must be ${SCHEMA_VERSION}`);
    }
    assertUuid(entity, 'id', value.id);
    assertUuid(entity, 'householdId', value.householdId);
    if (value.serviceType !== SERVICE_TYPE) {
      fail(entity, 'serviceType', `must be ${SERVICE_TYPE}`);
    }
    assertNonEmptyString(entity, 'displayLabel', value.displayLabel);
    if (!JOURNEY_STATUSES.includes(value.status)) {
      fail(entity, 'status', `must be one of ${JOURNEY_STATUSES.join(', ')}`);
    }
    assertIsoTimestamp(entity, 'createdAt', value.createdAt);
    assertIsoTimestamp(entity, 'updatedAt', value.updatedAt);
    return true;
  }

  function validateViewport(value) {
    const entity = 'MapProject';
    assertPlainObject(entity, 'viewport', value);
    assertAllowedFields(entity, value, ['center', 'zoom']);
    assertRequiredFields(entity, value, ['center', 'zoom']);

    assertPlainObject(entity, 'viewport.center', value.center);
    assertAllowedFields(entity, value.center, ['lat', 'lng']);
    assertRequiredFields(entity, value.center, ['lat', 'lng']);

    assertFiniteNumber(entity, 'viewport.center.lat', value.center.lat);
    if (value.center.lat < -90 || value.center.lat > 90) {
      fail(entity, 'viewport.center.lat', 'must be between -90 and 90');
    }
    assertFiniteNumber(entity, 'viewport.center.lng', value.center.lng);
    if (value.center.lng < -180 || value.center.lng > 180) {
      fail(entity, 'viewport.center.lng', 'must be between -180 and 180');
    }
    assertFiniteNumber(entity, 'viewport.zoom', value.zoom);
    if (!Number.isInteger(value.zoom) || value.zoom < 0 || value.zoom > 22) {
      fail(entity, 'viewport.zoom', 'must be an integer between 0 and 22');
    }
  }

  function validateHazardLayers(value) {
    const entity = 'MapProject';
    const fields = ['flood', 'landslide', 'hightide', 'tsunami', 'opacity'];
    assertPlainObject(entity, 'hazardLayers', value);
    assertAllowedFields(entity, value, fields);
    assertRequiredFields(entity, value, fields);

    for (const field of ['flood', 'landslide', 'hightide', 'tsunami']) {
      if (typeof value[field] !== 'boolean') {
        fail(entity, `hazardLayers.${field}`, 'must be a boolean');
      }
    }
    assertFiniteNumber(entity, 'hazardLayers.opacity', value.opacity);
    if (value.opacity < 0 || value.opacity > 1) {
      fail(entity, 'hazardLayers.opacity', 'must be between 0 and 1');
    }
  }

  function validateFeatureCollection(value) {
    const entity = 'MapProject';
    assertPlainObject(entity, 'featureCollection', value);
    assertAllowedFields(entity, value, ['type', 'features'], 'featureCollection');
    assertRequiredFields(entity, value, ['type', 'features'], 'featureCollection');

    if (value.type !== 'FeatureCollection') {
      fail(entity, 'featureCollection.type', 'must be FeatureCollection');
    }
    if (!Array.isArray(value.features)) {
      fail(entity, 'featureCollection.features', 'must be an array');
    }

    const featureIds = new Set();
    value.features.forEach((feature, index) => {
      const field = `featureCollection.features[${index}]`;
      validateCircleFeatureValue(feature, entity, field);
      if (featureIds.has(feature.id)) {
        fail(entity, `${field}.id`, `duplicate ID ${feature.id}`);
      }
      featureIds.add(feature.id);
    });
    return true;
  }

  function validateCircleFeatureValue(value, entity, field) {
    const fields = ['type', 'id', 'geometry', 'properties'];
    assertPlainObject(entity, field, value);
    assertAllowedFields(entity, value, fields, field);
    assertRequiredFields(entity, value, fields, field);

    if (value.type !== 'Feature') {
      fail(entity, `${field}.type`, 'must be Feature');
    }
    assertUuid(entity, `${field}.id`, value.id);

    const geometryField = `${field}.geometry`;
    assertPlainObject(entity, geometryField, value.geometry);
    assertAllowedFields(
      entity,
      value.geometry,
      ['type', 'coordinates'],
      geometryField,
    );
    assertRequiredFields(
      entity,
      value.geometry,
      ['type', 'coordinates'],
      geometryField,
    );
    if (value.geometry.type !== 'Point') {
      fail(entity, `${geometryField}.type`, 'must be Point');
    }
    if (!Array.isArray(value.geometry.coordinates)
      || value.geometry.coordinates.length !== 2) {
      fail(entity, `${geometryField}.coordinates`, 'must contain exactly [lng, lat]');
    }

    const [lng, lat] = value.geometry.coordinates;
    assertFiniteNumber(entity, `${geometryField}.coordinates[0]`, lng);
    if (lng < -180 || lng > 180) {
      fail(entity, `${geometryField}.coordinates[0]`, 'must be between -180 and 180');
    }
    assertFiniteNumber(entity, `${geometryField}.coordinates[1]`, lat);
    if (lat < -90 || lat > 90) {
      fail(entity, `${geometryField}.coordinates[1]`, 'must be between -90 and 90');
    }

    const propertiesField = `${field}.properties`;
    const propertyFields = [
      'schemaVersion',
      'kind',
      'radiusMeters',
      'color',
      'label',
    ];
    assertPlainObject(entity, propertiesField, value.properties);
    assertAllowedFields(entity, value.properties, propertyFields, propertiesField);
    assertRequiredFields(entity, value.properties, propertyFields, propertiesField);

    if (value.properties.schemaVersion !== SCHEMA_VERSION) {
      fail(entity, `${propertiesField}.schemaVersion`, `must be ${SCHEMA_VERSION}`);
    }
    if (value.properties.kind !== 'circle') {
      fail(entity, `${propertiesField}.kind`, 'must be circle');
    }
    assertFiniteNumber(
      entity,
      `${propertiesField}.radiusMeters`,
      value.properties.radiusMeters,
    );
    if (value.properties.radiusMeters < 50
      || value.properties.radiusMeters > 50000) {
      fail(
        entity,
        `${propertiesField}.radiusMeters`,
        'must be between 50 and 50000',
      );
    }
    if (typeof value.properties.color !== 'string'
      || !HEX_COLOR_PATTERN.test(value.properties.color)) {
      fail(entity, `${propertiesField}.color`, 'must use #RRGGBB format');
    }
    assertNonEmptyString(entity, `${propertiesField}.label`, value.properties.label);
    return true;
  }

  function validateCircleFeature(value) {
    return validateCircleFeatureValue(value, 'CircleFeature', 'feature');
  }

  function validateMapProject(value) {
    const entity = 'MapProject';
    assertPlainObject(entity, 'entity', value);
    const fields = [
      'schemaVersion',
      'id',
      'journeyId',
      'displayLabel',
      'viewport',
      'hazardLayers',
      'featureCollection',
      'createdAt',
      'updatedAt',
    ];
    assertAllowedFields(entity, value, fields);
    assertRequiredFields(entity, value, fields);

    if (value.schemaVersion !== SCHEMA_VERSION) {
      fail(entity, 'schemaVersion', `must be ${SCHEMA_VERSION}`);
    }
    assertUuid(entity, 'id', value.id);
    assertUuid(entity, 'journeyId', value.journeyId);
    assertNonEmptyString(entity, 'displayLabel', value.displayLabel);
    validateViewport(value.viewport);
    validateHazardLayers(value.hazardLayers);
    validateFeatureCollection(value.featureCollection);
    assertIsoTimestamp(entity, 'createdAt', value.createdAt);
    assertIsoTimestamp(entity, 'updatedAt', value.updatedAt);
    return true;
  }

  function createHousehold(input, options) {
    const entity = 'Household';
    const value = input === undefined ? {} : input;
    assertPlainObject(entity, 'input', value);
    assertAllowedFields(entity, value, ['displayCode']);
    assertRequiredFields(entity, value, ['displayCode']);
    const identity = createIdentity(entity, options);
    const household = {
      schemaVersion: SCHEMA_VERSION,
      id: identity.id,
      displayCode: value.displayCode,
      createdAt: identity.timestamp,
      updatedAt: identity.timestamp,
    };
    validateHousehold(household);
    return household;
  }

  function createJourney(input, options) {
    const entity = 'Journey';
    const value = input === undefined ? {} : input;
    assertPlainObject(entity, 'input', value);
    assertAllowedFields(entity, value, [
      'householdId',
      'serviceType',
      'displayLabel',
      'status',
    ]);
    assertRequiredFields(entity, value, ['householdId', 'displayLabel']);
    const identity = createIdentity(entity, options);
    const journey = {
      schemaVersion: SCHEMA_VERSION,
      id: identity.id,
      householdId: value.householdId,
      serviceType: value.serviceType === undefined ? SERVICE_TYPE : value.serviceType,
      displayLabel: value.displayLabel,
      status: value.status === undefined ? 'active' : value.status,
      createdAt: identity.timestamp,
      updatedAt: identity.timestamp,
    };
    validateJourney(journey);
    return journey;
  }

  function createMapProject(input, options) {
    const entity = 'MapProject';
    const value = input === undefined ? {} : input;
    assertPlainObject(entity, 'input', value);
    assertAllowedFields(entity, value, [
      'journeyId',
      'displayLabel',
      'viewport',
      'hazardLayers',
      'featureCollection',
    ]);
    assertRequiredFields(entity, value, ['journeyId', 'displayLabel']);
    const identity = createIdentity(entity, options);
    const mapProject = {
      schemaVersion: SCHEMA_VERSION,
      id: identity.id,
      journeyId: value.journeyId,
      displayLabel: value.displayLabel,
      viewport: value.viewport === undefined
        ? cloneData(DEFAULT_VIEWPORT)
        : cloneData(value.viewport),
      hazardLayers: value.hazardLayers === undefined
        ? cloneData(DEFAULT_HAZARD_LAYERS)
        : cloneData(value.hazardLayers),
      featureCollection: value.featureCollection === undefined
        ? { type: 'FeatureCollection', features: [] }
        : cloneData(value.featureCollection),
      createdAt: identity.timestamp,
      updatedAt: identity.timestamp,
    };
    validateMapProject(mapProject);
    return mapProject;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    SERVICE_TYPE,
    JOURNEY_STATUSES,
    DEFAULT_VIEWPORT,
    DEFAULT_HAZARD_LAYERS,
    ValidationError,
    createHousehold,
    createJourney,
    createMapProject,
    validateCircleFeature,
    validateFeatureCollection,
    validateHousehold,
    validateJourney,
    validateMapProject,
  });
});
