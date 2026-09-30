const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../../area-canvas/js/flood-identify-domain.js');
const hit = (overrides = {}) => ({ riverName: '試験河川', riverNumber: 'test-river',
  manager: '試験管理者', managerNumber: 'test-manager', depth: '0.5～3.0m未満',
  depthRank: 2, boundary: false, partial: false, ...overrides });
const group = (hits, status = 'READY', invalidCount = 0) => domain.toGroup({ hits, status, invalidCount });

test('Flood display: one Feature prioritizes river and depth, retaining formal evidence', () => {
  const g = group([hit()]);
  assert.equal(g.status, 'READY');
  assert.match(g.floodDisplay.overview[0], /1件/);
  assert.deepEqual(g.floodDisplay.overview.slice(1), ['試験河川', '0.5～3.0m未満']);
  assert.ok(!g.floodDisplay.overview.join(' ').includes('test-manager'));
  assert.match(g.floodDisplay.details.join(' '), /試験管理者/);
  assert.match(g.floodDisplay.evidence.join(' '), /test-river.*test-manager/);
  assert.match(g.floodDisplay.evidence.join(' '), /公式ランク：2/);
  assert.match(g.floodDisplay.evidence.join(' '), /2024年度/);
  assert.deepEqual(g.floodDisplay.evidence, g.lines);
  assert.equal(g.links.length, 3);
});
test('Flood display: multiple Features preserve every entry without claiming river count', () => {
  const g = group([hit(), hit({riverName:'別河川'}), hit({riverName:'第三河川'})]);
  assert.match(g.floodDisplay.overview[0], /3件/);
  assert.ok(!g.floodDisplay.overview.join(' ').includes('3河川'));
  assert.equal(g.floodDisplay.overview.filter(x => x === '0.5～3.0m未満').length, 3);
  assert.equal(g.floodDisplay.details.length, 6);
});
test('Flood display: repeated river names remain individual Features with an explicit note', () => {
  const g = group([hit(), hit({depth:'3.0～5.0m未満',depthRank:3})]);
  assert.match(g.floodDisplay.overview.join(' '), /同じ河川名/);
  assert.equal(g.floodDisplay.overview.filter(x => x === '試験河川').length, 2);
  assert.match(g.floodDisplay.overview.join(' '), /0.5～3.0m未満.*3.0～5.0m未満/);
});
test('Flood display: unknown attributes show unconfirmed values and preserve unknown code', () => {
  const g = group([hit({riverName:null,manager:null,depth:null,depthRank:99,partial:true})], 'PARTIAL');
  assert.equal(g.status, 'PARTIAL');
  assert.match(g.floodDisplay.overview.join(' '), /河川名：未確認.*浸水深区分：未確認/);
  assert.match(g.floodDisplay.details.join(' '), /河川管理者：未確認/);
  assert.match(g.floodDisplay.evidence.join(' '), /公式ランク：99/);
});
test('Flood display: PARTIAL keeps uncertainty visible and boundary/incomplete cautions in Evidence', () => {
  const g = group([hit({boundary:true})], 'PARTIAL', 1);
  assert.equal(g.status, 'PARTIAL');
  assert.match(g.floodDisplay.overview.join(' '), /完全性は未確認/);
  assert.match(g.floodDisplay.evidence.join(' '), /Polygon境界上/);
  assert.match(g.floodDisplay.evidence.join(' '), /不正なFeature/);
});
test('Flood display: NO_DATA retains the no-hit warning above folds', () => {
  const g = group([], 'NO_DATA');
  assert.equal(g.status, 'NO_DATA');
  assert.match(g.floodDisplay.overview.join(' '), /該当Polygonは確認されませんでした/);
  assert.match(g.floodDisplay.overview.join(' '), /浸水しないことを意味しません/);
});
test('Flood display: UNAVAILABLE remains distinct from NO_DATA above folds', () => {
  const g = group([], 'UNAVAILABLE');
  assert.equal(g.status, 'UNAVAILABLE');
  assert.match(g.floodDisplay.overview.join(' '), /取得・検証できませんでした/);
  assert.match(g.floodDisplay.overview.join(' '), /区域外とは判定していません/);
  assert.match(g.floodDisplay.evidence.join(' '), /XKT026/);
});
