'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  aggregateRoadFeatures,
  coordinateCount,
} = require('../../scripts/generate-road.cjs');

test('道路をN13_003ごとに集約し、全座標と入力を維持する', () => {
  const features = [
    {
      type: 'Feature',
      properties: { N13_003: '1', unused: 'source-only' },
      geometry: { type: 'LineString', coordinates: [[136, 35], [137, 35]] },
    },
    {
      type: 'Feature',
      properties: { N13_003: '1' },
      geometry: {
        type: 'MultiLineString',
        coordinates: [[[137, 35], [138, 35]], [[138, 35], [139, 35]]],
      },
    },
    {
      type: 'Feature',
      properties: { N13_003: '2' },
      geometry: { type: 'LineString', coordinates: [[136, 34], [137, 34]] },
    },
  ];
  const before = structuredClone(features);
  const result = aggregateRoadFeatures(features);

  assert.equal(result.sourceFeatureCount, 3);
  assert.equal(result.sourceLinePartCount, 4);
  assert.equal(result.sourceCoordinateCount, 8);
  assert.equal(result.features.length, 2);
  assert.deepEqual(result.features.map((feature) => feature.properties.N13_003), ['1', '2']);
  assert.equal(result.features.reduce(
    (total, feature) => total + coordinateCount(feature.geometry.coordinates),
    0,
  ), 8);
  assert.deepEqual(features, before);
});
