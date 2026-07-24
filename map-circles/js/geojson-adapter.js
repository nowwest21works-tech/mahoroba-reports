(function (root, factory) {
  const domain = typeof module === 'object' && module.exports
    ? require('./domain.js')
    : root.MapCirclesDomain;
  const api = factory(root, domain);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MapCirclesGeoJsonAdapter = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, domain) {
  'use strict';

  if (!domain) {
    throw new Error('MapCirclesGeoJsonAdapter.domain: MapCirclesDomain is required');
  }

  class AdapterError extends Error {
    constructor(field, message) {
      super(`CircleRecord.${field}: ${message}`);
      this.name = 'AdapterError';
      this.entity = 'CircleRecord';
      this.field = field;
    }
  }

  function fail(field, message) {
    throw new AdapterError(field, message);
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function assertPlainObject(field, value) {
    if (!isPlainObject(value)) fail(field, 'must be a plain object');
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

  function resolveIdGenerator(options) {
    const value = options === undefined ? {} : options;
    assertPlainObject('options', value);
    for (const field of Object.keys(value)) {
      if (field !== 'idGenerator') fail(`options.${field}`, 'is not allowed');
    }
    if (value.idGenerator !== undefined && typeof value.idGenerator !== 'function') {
      fail('options.idGenerator', 'must be a function');
    }
    return value.idGenerator || defaultIdGenerator;
  }

  function resolveFeatureId(record, idGenerator) {
    if (Object.prototype.hasOwnProperty.call(record, 'featureId')) {
      return record.featureId;
    }
    try {
      return idGenerator('CircleFeature');
    } catch (error) {
      fail('featureId', `generation failed: ${error.message}`);
    }
  }

  function circleRecordToFeature(record, options) {
    assertPlainObject('record', record);
    const fields = ['featureId', 'center', 'radius', 'color', 'label'];
    for (const field of Object.keys(record)) {
      if (!fields.includes(field)) fail(field, 'is not allowed');
    }
    for (const field of ['center', 'radius', 'color', 'label']) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        fail(field, 'is required');
      }
    }
    if (!Array.isArray(record.center) || record.center.length !== 2) {
      fail('center', 'must contain exactly [lat, lng]');
    }

    const idGenerator = resolveIdGenerator(options);
    const [lat, lng] = record.center;
    const feature = {
      type: 'Feature',
      id: resolveFeatureId(record, idGenerator),
      geometry: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      properties: {
        schemaVersion: domain.SCHEMA_VERSION,
        kind: 'circle',
        radiusMeters: record.radius,
        color: record.color,
        label: record.label,
      },
    };
    domain.validateCircleFeature(feature);
    return feature;
  }

  function featureToCircleRecord(feature) {
    domain.validateCircleFeature(feature);
    return {
      featureId: feature.id,
      center: [
        feature.geometry.coordinates[1],
        feature.geometry.coordinates[0],
      ],
      radius: feature.properties.radiusMeters,
      color: feature.properties.color,
      label: feature.properties.label,
    };
  }

  function circleRecordsToFeatureCollection(records, options) {
    if (!Array.isArray(records)) {
      fail('records', 'must be an array');
    }
    const featureCollection = {
      type: 'FeatureCollection',
      features: records.map((record) => circleRecordToFeature(record, options)),
    };
    domain.validateFeatureCollection(featureCollection);
    return featureCollection;
  }

  function featureCollectionToCircleRecords(featureCollection) {
    domain.validateFeatureCollection(featureCollection);
    return featureCollection.features.map(featureToCircleRecord);
  }

  function validateCircleFeature(feature) {
    return domain.validateCircleFeature(cloneData(feature));
  }

  return Object.freeze({
    AdapterError,
    circleRecordToFeature,
    circleRecordsToFeatureCollection,
    featureCollectionToCircleRecords,
    featureToCircleRecord,
    validateCircleFeature,
  });
});
