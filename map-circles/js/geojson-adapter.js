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

  function resolveFeatureId(record, idGenerator, entity = 'CircleFeature') {
    if (Object.prototype.hasOwnProperty.call(record, 'featureId')) {
      return record.featureId;
    }
    try {
      return idGenerator(entity);
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

  function assertAllowedRecordFields(record, fields) {
    for (const field of Object.keys(record)) {
      if (!fields.includes(field)) fail(field, 'is not allowed');
    }
  }

  function assertRequiredRecordFields(record, fields) {
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        fail(field, 'is required');
      }
    }
  }

  function positionsToCoordinates(positions, field) {
    if (!Array.isArray(positions)) fail(field, 'must be an array');
    return positions.map((position, index) => {
      if (!Array.isArray(position) || position.length !== 2) {
        fail(`${field}[${index}]`, 'must contain exactly [lat, lng]');
      }
      return [position[1], position[0]];
    });
  }

  function coordinatesToPositions(coordinates) {
    return coordinates.map((position) => [position[1], position[0]]);
  }

  function shapeRecordToFeature(record, options) {
    assertPlainObject('record', record);
    const kind = record.kind;
    if (!['circle', 'marker', 'line', 'polygon'].includes(kind)) {
      fail('kind', 'must be circle, marker, line, or polygon');
    }
    if (kind === 'circle') {
      assertAllowedRecordFields(
        record,
        ['kind', 'featureId', 'center', 'radius', 'color', 'label'],
      );
      assertRequiredRecordFields(record, ['kind', 'center', 'radius', 'color', 'label']);
      const circleRecord = cloneData(record);
      delete circleRecord.kind;
      return circleRecordToFeature(circleRecord, options);
    }

    const fields = kind === 'marker'
      ? ['kind', 'featureId', 'center', 'label']
      : kind === 'line'
        ? ['kind', 'featureId', 'points', 'color', 'label']
        : ['kind', 'featureId', 'rings', 'color', 'label'];
    assertAllowedRecordFields(record, fields);
    assertRequiredRecordFields(
      record,
      fields.filter((field) => field !== 'featureId'),
    );

    const idGenerator = resolveIdGenerator(options);
    let geometry;
    if (kind === 'marker') {
      const coordinates = positionsToCoordinates([record.center], 'center')[0];
      geometry = { type: 'Point', coordinates };
    } else if (kind === 'line') {
      geometry = {
        type: 'LineString',
        coordinates: positionsToCoordinates(record.points, 'points'),
      };
    } else {
      if (!Array.isArray(record.rings)) fail('rings', 'must be an array');
      geometry = {
        type: 'Polygon',
        coordinates: record.rings.map((ring, index) =>
          positionsToCoordinates(ring, `rings[${index}]`)),
      };
    }

    const properties = {
      schemaVersion: domain.SCHEMA_VERSION,
      kind,
      ...(kind === 'marker' ? {} : { color: record.color }),
      label: record.label,
    };
    const feature = {
      type: 'Feature',
      id: resolveFeatureId(record, idGenerator, `${kind}Feature`),
      geometry,
      properties,
    };
    domain.validateMapFeature(feature);
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

  function featureToShapeRecord(feature) {
    domain.validateMapFeature(feature);
    const { kind } = feature.properties;
    if (kind === 'circle') {
      return {
        kind,
        ...featureToCircleRecord(feature),
      };
    }
    if (kind === 'marker') {
      return {
        kind,
        featureId: feature.id,
        center: [
          feature.geometry.coordinates[1],
          feature.geometry.coordinates[0],
        ],
        label: feature.properties.label,
      };
    }
    if (kind === 'line') {
      return {
        kind,
        featureId: feature.id,
        points: coordinatesToPositions(feature.geometry.coordinates),
        color: feature.properties.color,
        label: feature.properties.label,
      };
    }
    return {
      kind,
      featureId: feature.id,
      rings: feature.geometry.coordinates.map(coordinatesToPositions),
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

  function shapeRecordsToFeatureCollection(records, options) {
    if (!Array.isArray(records)) {
      fail('records', 'must be an array');
    }
    const featureCollection = {
      type: 'FeatureCollection',
      features: records.map((record) => shapeRecordToFeature(record, options)),
    };
    domain.validateFeatureCollection(featureCollection);
    return featureCollection;
  }

  function featureCollectionToShapeRecords(featureCollection) {
    domain.validateFeatureCollection(featureCollection);
    return featureCollection.features.map(featureToShapeRecord);
  }

  function validateCircleFeature(feature) {
    return domain.validateCircleFeature(cloneData(feature));
  }

  function validateMapFeature(feature) {
    return domain.validateMapFeature(cloneData(feature));
  }

  return Object.freeze({
    AdapterError,
    circleRecordToFeature,
    circleRecordsToFeatureCollection,
    featureCollectionToCircleRecords,
    featureCollectionToShapeRecords,
    featureToCircleRecord,
    featureToShapeRecord,
    shapeRecordToFeature,
    shapeRecordsToFeatureCollection,
    validateCircleFeature,
    validateMapFeature,
  });
});
