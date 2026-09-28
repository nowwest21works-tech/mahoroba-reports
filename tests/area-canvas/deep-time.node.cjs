const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const domain = require('../../area-canvas/js/deep-time-domain.js');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,
  '../../area-canvas/data/deep-time/manifest.json'), 'utf8'));

test('Deep Time defaults and exclusive era normalization', () => {
  assert.deepEqual(domain.defaultState(), { enabled: false, era: 'present', overlays: [], opacity: 60 });
  assert.equal(domain.normalizeState({ enabled: true, era: 'jomon' }).era, 'jomon');
  assert.equal(domain.normalizeState({ era: ['jomon', 'lgm'] }).era, 'present');
});

test('master OFF and unavailable datasets fail closed', () => {
  domain.validateManifest(manifest);
  assert.deepEqual(domain.effectiveSelection({ enabled: false, era: 'jomon',
    overlays: ['geology'] }, manifest), { era: 'present', overlays: [] });
  assert.deepEqual(domain.effectiveSelection({ enabled: true, era: 'jomon',
    overlays: ['geology'] }, manifest), { era: 'present', overlays: [] });
});

test('opacity is bounded and invalid manifests are rejected', () => {
  assert.equal(domain.normalizeState({ opacity: 2 }).opacity, 10);
  assert.equal(domain.normalizeState({ opacity: 140 }).opacity, 100);
  assert.equal(domain.normalizeState({ opacity: 'invalid' }).opacity, 60);
  assert.equal(domain.normalizeState({ opacity: true }).opacity, 60);
  assert.equal(domain.normalizeState({ opacity: ' ' }).opacity, 60);
  assert.throws(() => domain.validateManifest({ schemaVersion: 1, datasets: [] }));
  const invalid = structuredClone(manifest);
  invalid.datasets[0].status = 'connected';
  assert.throws(() => domain.validateManifest(invalid));
});

test('current era permits verified evidence, while missing source or geometry fails closed', () => {
  const connected = structuredClone(manifest);
  Object.assign(connected.datasets.find((item) => item.id === 'geology'), {
    status: 'connected', authority: 'EVIDENCE', sourceOrg: 'Example Institute',
    sourceTitle: 'Verified geology dataset', license: 'CC BY 4.0', publicAllowed: true,
    geometry: 'Polygon', url: './data/deep-time/geology.geojson',
  });
  domain.validateManifest(connected);
  assert.deepEqual(domain.effectiveSelection({ enabled: true, era: 'present',
    overlays: ['geology'] }, connected), { era: 'present', overlays: ['geology'] });
  assert.deepEqual(domain.effectiveSelection({ enabled: false, era: 'present',
    overlays: ['geology'] }, connected), { era: 'present', overlays: [] });

  const missingSource = structuredClone(connected);
  delete missingSource.datasets.find((item) => item.id === 'geology').sourceTitle;
  assert.throws(() => domain.validateManifest(missingSource));
  const missingGeometry = structuredClone(connected);
  delete missingGeometry.datasets.find((item) => item.id === 'geology').geometry;
  assert.throws(() => domain.validateManifest(missingGeometry));
  const badEnum = structuredClone(connected);
  badEnum.datasets.find((item) => item.id === 'geology').authority = 'UNKNOWN';
  assert.throws(() => domain.validateManifest(badEnum));
  const unknownLicense = structuredClone(connected);
  unknownLicense.datasets.find((item) => item.id === 'geology').license = 'unknown';
  assert.throws(() => domain.validateManifest(unknownLicense));
  const unknownPeriod = structuredClone(connected);
  unknownPeriod.datasets.find((item) => item.id === 'geology').period = 'unknown';
  assert.throws(() => domain.validateManifest(unknownPeriod));
  const traversalUrl = structuredClone(connected);
  traversalUrl.datasets.find((item) => item.id === 'geology').url = './data/deep-time/%2e%2e/other.geojson';
  assert.throws(() => domain.validateManifest(traversalUrl));
  const malformedSubset = { schemaVersion: 1, datasets: [connected.datasets.find((item) => item.id === 'geology')] };
  assert.equal(domain.available(malformedSubset, 'geology'), false);
});

test('missing or malformed feature geometry cannot reach Leaflet', () => {
  const dataset = { id: 'geology', status: 'connected', publicAllowed: true,
    authority: 'EVIDENCE', sourceOrg: 'Example Institute', sourceTitle: 'Source',
    license: 'CC BY 4.0', geometry: 'Polygon', url: './data/deep-time/geology.geojson' };
  assert.throws(() => domain.validateGeoJson({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: null, properties: {} },
  ] }, dataset));
  assert.throws(() => domain.validateGeoJson({ type: 'FeatureCollection', features: [] }, dataset));
  assert.throws(() => domain.validateGeoJson({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], ['NaN', 1], [1, 1], [0, 0]]] },
      properties: {},
    },
  ] }, dataset));
  assert.throws(() => domain.validateGeoJson({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[500, 0], [1, 1], [0, 0]]] },
      properties: {},
    },
  ] }, dataset));
});
