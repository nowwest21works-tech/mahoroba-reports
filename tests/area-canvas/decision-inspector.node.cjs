const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../../area-canvas/js/decision-inspector-domain.js');

test('point evidence aggregate preserves partial, absent and unavailable results', () => {
  assert.equal(domain.summarizeStatus(['READY', 'READY', 'READY']), 'READY');
  assert.equal(domain.summarizeStatus(['READY', 'NO_DATA', 'UNAVAILABLE']), 'PARTIAL');
  assert.equal(domain.summarizeStatus(['PARTIAL', 'UNAVAILABLE']), 'PARTIAL');
  assert.equal(domain.summarizeStatus(['NO_FEATURE', 'NO_DATA']), 'NO_DATA');
  assert.equal(domain.summarizeStatus(['UNAVAILABLE', 'unknown']), 'UNAVAILABLE');
  assert.equal(domain.summarizeStatus([]), 'UNAVAILABLE');
  assert.equal(domain.normalizeStatus(undefined), 'UNAVAILABLE');
});

test('late point response and response after closing cannot replace selected point', () => {
  assert.equal(domain.acceptResult(1, 2, true), false);
  assert.equal(domain.acceptResult(2, 2, false), false);
  assert.equal(domain.acceptResult(2, 2, true), true);
});

// Exercise the existing browser adapter with deterministic evidence and a small DOM.
// Test hooks are inserted in memory only; the product exports stay unchanged.
const fs = require('node:fs');
const vm = require('node:vm');
function harness(terrainIdentify, elevation = { status: 'NO_DATA', value: null }) {
  function element() {
    return { children: [], textContent: '', hidden: false,
      append(...items) { this.children.push(...items); },
      replaceChildren() { this.children = []; this.textContent = ''; } };
  }
  const output = element();
  const urban = { textContent: '区域区分：OFF' };
  const deep = { textContent: 'OFF · データ未接続' };
  const geology = { checked: false };
  const document = {
    createElement: element,
    getElementById(id) { return { 'geology-identify-result': output,
      'urban-area-classification-state': urban, 'deep-time-state': deep }[id]; },
    querySelector(selector) { return selector.includes('seamless-geology') ? geology : null; },
    querySelectorAll() { return []; },
  };
  let geologyRequests = 0;
  const context = vm.createContext({ document, DecisionInspectorDomain: domain,
    TerrainIdentify: { identify: terrainIdentify },
    ElevationIdentify: { identify: async () => elevation },
    fetch: async () => { geologyRequests += 1; throw Error('offline'); },
  });
  const code = fs.readFileSync(require.resolve('../../area-canvas/js/research-layers.js'), 'utf8')
    .replace('    handleMapClick,', '    state, identifyPoint, renderInspector, handleMapClick,');
  vm.runInContext(code, context);
  context.ResearchLayers.state.identifyMode = true;
  function text(node) { return [node.textContent, ...node.children.map(text)].join(' '); }
  return { adapter: context.ResearchLayers, output, urban, deep, geology,
    text: () => text(output), geologyRequests: () => geologyRequests };
}

test('adapter renders coordinates, missing evidence, sources and live context without new requests', async () => {
  const h = harness(async () => ({ status: 'NO_FEATURE', classification: null,
    sourceUrl: 'https://www.gsi.go.jp/bousaichiri/lfc_index.html' }));
  await h.adapter.identifyPoint({ lat: 35, lng: 136 });
  assert.match(h.text(), /35.000000.*136.000000/);
  assert.match(h.text(), /Evidence Status：PARTIAL/);
  assert.match(h.text(), /Status：NO_DATA/);
  assert.match(h.text(), /地質図レイヤーがOFF/);
  assert.equal(h.geologyRequests(), 0);
  const sourceIndex = h.text().indexOf('出典・参照資料');
  assert.ok(sourceIndex > h.text().indexOf('現在の表示Context'));
  assert.ok(h.text().indexOf('注意事項') > sourceIndex);
  h.urban.textContent = '区域区分：ON（949区画）';
  h.deep.textContent = 'ON · 選択した時代は復元データ準備中です。地図には表示していません';
  h.adapter.renderInspector();
  assert.match(h.text(), /949区画/);
  assert.match(h.text(), /復元データ準備中/);
  assert.equal(h.geologyRequests(), 0);
});

test('adapter ignores late result from previous point and results while inspector is OFF', async () => {
  const pending = [];
  const h = harness(() => new Promise((resolve) => pending.push(resolve)));
  const first = h.adapter.identifyPoint({ lat: 35, lng: 136 });
  const second = h.adapter.identifyPoint({ lat: 36, lng: 137 });
  const result = { status: 'UNAVAILABLE', classification: null,
    sourceUrl: 'https://www.gsi.go.jp/bousaichiri/lfc_index.html' };
  pending[1](result);
  await second;
  const latest = h.text();
  pending[0](result);
  await first;
  assert.equal(h.text(), latest);
  assert.match(latest, /36.000000.*137.000000/);
  const third = h.adapter.identifyPoint({ lat: 37, lng: 138 });
  h.adapter.state.identifyMode = false;
  h.output.hidden = true;
  pending[2](result);
  await third;
  assert.equal(h.output.hidden, true);
});

test('adapter keeps zero DEM elevation, original DEM source and unknown terrain code explicit', async () => {
  const h = harness(async () => ({ status: 'READY', classification: { code: '99999', name: null },
    sourceUrl: 'https://www.gsi.go.jp/bousaichiri/lfc_index.html' }),
    { status: 'READY', value: 0, dem: { id: 'DEM5A', source: '航空レーザ測量', decimals: 1 } });
  await h.adapter.identifyPoint({ lat: 35, lng: 136 });
  assert.match(h.text(), /標高：約 0.0 m/);
  assert.match(h.text(), /DEM種別：DEM5A/);
  assert.match(h.text(), /元データ：航空レーザ測量/);
  assert.match(h.text(), /地形分類名は未確認（公式コード：99999）/);
  assert.match(h.text(), /地形分類（国土地理院・ベクトル資料） Status：PARTIAL/);
});
