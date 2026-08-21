#!/usr/bin/env node
'use strict';

// ========== 行政区域データ（国土数値情報 N03）生成 ==========
// data/administrative-boundary/aichi.geojson を作る。
// 生成手順・注意事項は scripts/lib/ksj-pipeline.cjs の冒頭コメントを参照。

const path = require('node:path');
const pipeline = require('./lib/ksj-pipeline.cjs');

const DATASET_LABEL = '行政区域データ(N03)';

// 要確認：下記の datalist ページで最新年度のダウンロードリンクを確認し、
// 実際のzip URLに置き換えてから実行する。
// 参照ページ: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html
const ZIP_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_23_GML.zip';

const OUTPUT_PATH = path.resolve(
  __dirname,
  '../area-canvas/data/administrative-boundary/aichi.geojson',
);

// N03の属性フィールド名は年度により若干異なる場合があるため、
// 実データ取得後にこの候補リストを実際のフィールド名で確認・調整すること。
const PREFECTURE_FIELD_CANDIDATES = ['N03_001', 'pref_name', 'prefecture'];
const TARGET_PREFECTURE = '愛知県';

function isAichi(properties) {
  for (const field of PREFECTURE_FIELD_CANDIDATES) {
    if (properties[field] === TARGET_PREFECTURE) return true;
  }
  return false;
}

async function main() {
  pipeline.assertUrlConfigured(ZIP_URL, DATASET_LABEL);
  const workDir = pipeline.makeWorkDir('n03');
  const zipPath = path.join(workDir, 'n03.zip');
  const extractDir = path.join(workDir, 'extracted');

  console.log(`${DATASET_LABEL}: ダウンロード中…`);
  pipeline.downloadZip(ZIP_URL, zipPath);
  pipeline.extractZip(zipPath, extractDir);

  const includedGeoJson = pipeline.findFileByExtension(extractDir, ['.geojson']);
  const sourceFile = includedGeoJson
    || pipeline.findFileByExtension(extractDir, ['.shp'])
    || pipeline.findFileByExtension(extractDir, ['.gml']);
  if (!sourceFile) {
    throw new Error(`${DATASET_LABEL}: 展開したzipの中にGeoJSON/.shp/.gmlが見つかりませんでした`);
  }

  const rawGeoJsonPath = includedGeoJson || path.join(workDir, 'raw.geojson');
  if (!includedGeoJson) {
    console.log(`${DATASET_LABEL}: GeoJSONへ変換中…`);
    pipeline.convertToGeoJson(sourceFile, rawGeoJsonPath);
  }

  const raw = pipeline.readGeoJson(rawGeoJsonPath);
  const filtered = raw.features.filter((feature) => isAichi(feature.properties || {}));

  if (filtered.length === 0) {
    throw new Error(
      `${DATASET_LABEL}: 愛知県のFeatureが0件でした。`
      + `PREFECTURE_FIELD_CANDIDATESが実データのフィールド名と一致しているか確認してください。`,
    );
  }

  const collection = {
    type: 'FeatureCollection',
    name: 'aichi-administrative-boundary',
    metadata: {
      schemaVersion: 1,
      layerType: 'administrative-boundary',
      sourceName: '国土数値情報（行政区域）国土交通省',
      dataset: 'N03-2025',
      sourceUrl: ZIP_URL,
      license: 'CC BY 4.0',
      generatedAt: new Date().toISOString(),
      featureCount: filtered.length,
    },
    features: filtered,
  };
  pipeline.writeGeoJson(OUTPUT_PATH, collection);
  console.log(`生成先: ${OUTPUT_PATH}`);
  console.log(`Feature数: ${filtered.length}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { OUTPUT_PATH, isAichi };
