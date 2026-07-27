const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CLASSIFICATIONS,
  classificationCodeFrom,
  formatReferenceYear,
  normalizeFeature,
  normalizeProperties,
  styleFor,
} = require('../../../journey-map/js/urban-area-classification-domain.js');
const {
  parseArguments,
  simplifyGeometry,
  tileRange,
} = require('../../../scripts/generate-urban-area-classification.cjs');

test('XKT001属性をUI用の正規化modelへ変換する', () => {
  const source = {
    area_classification_ja: '市街化調整区域',
    prefecture: '愛知県',
    city_name: '架空中央市',
    planning_area_name: '架空中央都市計画区域',
  };
  const normalized = normalizeProperties(source, { referenceYear: 2025 });
  assert.deepEqual(normalized, {
    schemaVersion: 1,
    layerType: 'urban-area-classification',
    classificationCode: 'urbanization-control-area',
    classificationLabel: '市街化調整区域',
    planningAreaName: '架空中央都市計画区域',
    prefectureName: '愛知県',
    municipalityName: '架空中央市',
    referenceYear: 2025,
    sourceName: '国土交通省 不動産情報ライブラリ',
    sourceDataset: 'XKT001',
  });
  assert.deepEqual(source, {
    area_classification_ja: '市街化調整区域',
    prefecture: '愛知県',
    city_name: '架空中央市',
    planning_area_name: '架空中央都市計画区域',
  });
});

test('区域区分を安定した分類codeへ変換し未知値をunknownにする', () => {
  assert.equal(classificationCodeFrom('市街化区域'), 'urbanization-promotion-area');
  assert.equal(classificationCodeFrom('市街化調整区域'), 'urbanization-control-area');
  assert.equal(
    classificationCodeFrom('非線引き都市計画区域'),
    'non-divided-city-planning-area',
  );
  assert.equal(
    classificationCodeFrom('都市計画区域外'),
    'outside-city-planning-area',
  );
  assert.equal(classificationCodeFrom('都市計画区域'), 'unknown');
  assert.equal(classificationCodeFrom('想定外'), 'unknown');
  assert.equal(classificationCodeFrom(undefined), 'unknown');
});

test('欠損属性をundefined文字列にせず項目自体を省略する', () => {
  const normalized = normalizeProperties({
    area_classification_ja: '市街化区域',
    prefecture: '   ',
    city_name: null,
  });
  assert.equal(normalized.classificationLabel, '市街化区域');
  assert.equal('prefectureName' in normalized, false);
  assert.equal('municipalityName' in normalized, false);
  assert.equal('planningAreaName' in normalized, false);
  assert.equal(JSON.stringify(normalized).includes('undefined'), false);
});

test('Polygonだけを複製して正規化し元Featureを変更しない', () => {
  const feature = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[136.88, 35.17], [136.89, 35.17], [136.88, 35.17]]],
    },
    properties: { area_classification_ja: '市街化区域' },
  };
  const before = structuredClone(feature);
  const normalized = normalizeFeature(feature);
  assert.deepEqual(feature, before);
  assert.notEqual(normalized.geometry, feature.geometry);
  assert.equal(normalized.properties.classificationCode, 'urbanization-promotion-area');
  assert.throws(
    () => normalizeFeature({ ...feature, geometry: { type: 'Point', coordinates: [] } }),
    /Polygon or MultiPolygon/,
  );
});

test('分類ごとのstyleが色・境界線・透明度を返す', () => {
  for (const code of Object.keys(CLASSIFICATIONS)) {
    const style = styleFor(code);
    assert.match(style.color, /^#[0-9a-f]{6}$/i);
    assert.match(style.fillColor, /^#[0-9a-f]{6}$/i);
    assert.ok(style.fillOpacity >= 0.1 && style.fillOpacity <= 0.3);
    assert.ok(style.weight >= 1);
  }
  assert.equal(styleFor('unknown-value').fillColor, CLASSIFICATIONS.unknown.fillColor);
});

test('基準年度を令和表示へ変換する', () => {
  assert.equal(formatReferenceYear(2025), '令和7年度');
  assert.equal(formatReferenceYear(2018), '2018年度');
  assert.equal(formatReferenceYear(undefined), undefined);
});

test('愛知県boundsを覆うXKT001 tile一覧を決定的に作る', () => {
  const tiles = tileRange();
  assert.ok(tiles.length > 0);
  assert.ok(tiles.length < 100);
  assert.deepEqual(tiles, tileRange());
  assert.ok(tiles.every((tile) => tile.z === 11));
});

test('生成引数を検証し、簡略化は明示指定時だけ行う', () => {
  assert.deepEqual(
    {
      ...parseArguments([]),
      output: '<absolute>',
    },
    {
      output: '<absolute>',
      tolerance: 0,
      zoom: 11,
    },
  );
  assert.throws(() => parseArguments(['--zoom', '10']), /11〜15/);
  assert.throws(() => parseArguments(['--tolerance', '-1']), /0以上/);

  const geometry = {
    type: 'Polygon',
    coordinates: [[
      [136.88, 35.17],
      [136.880001, 35.170001],
      [136.89, 35.17],
      [136.89, 35.18],
      [136.88, 35.17],
    ]],
  };
  assert.equal(simplifyGeometry(geometry, 0), geometry);
  const simplified = simplifyGeometry(geometry, 0.00001);
  assert.deepEqual(simplified.coordinates[0].at(0), simplified.coordinates[0].at(-1));
  assert.ok(simplified.coordinates[0].length >= 4);
});
