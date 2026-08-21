'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  trackedRiverDataFiles,
} = require('../../scripts/check-area-canvas-public.cjs');

test('W05由来のriver dataだけをpublic境界違反として検出する', () => {
  assert.deepEqual(trackedRiverDataFiles([
    'area-canvas/data/river/README.md',
    'area-canvas/data/river/aichi.geojson',
    'area-canvas/data/road/aichi.geojson',
    'scripts/generate-river.cjs',
  ]), ['area-canvas/data/river/aichi.geojson']);
});
