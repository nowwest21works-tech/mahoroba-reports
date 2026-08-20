#!/usr/bin/env node
'use strict';

// ========== 河川データ（国土数値情報 W05）生成 ==========
// data/river/aichi.geojson を作る。この生成物は非商用のためInternal / Local QA専用で、
// .gitignoreによりpublic repository / GitHub Pagesの配布対象から除外する。
// 生成手順・注意事項は scripts/lib/ksj-pipeline.cjs の冒頭コメントを参照。

const path = require('node:path');
const pipeline = require('./lib/ksj-pipeline.cjs');

const DATASET_LABEL = '河川データ(W05)';

// 要確認：下記の datalist ページで愛知県のダウンロードリンクを確認する。
// 参照ページ: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W05.html
const ZIP_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/W05/W05-08/W05-08_23_GML.zip';

const OUTPUT_PATH = path.resolve(__dirname, '../area-canvas/data/river/aichi.geojson');
const ADMIN_BOUNDARY_PATH = path.resolve(
  __dirname,
  '../area-canvas/data/administrative-boundary/aichi.geojson',
);

const ALLOWED_GEOMETRY_TYPES = ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'];

async function main() {
  pipeline.assertUrlConfigured(ZIP_URL, DATASET_LABEL);
  const workDir = pipeline.makeWorkDir('w05');
  const zipPath = path.join(workDir, 'w05.zip');
  const extractDir = path.join(workDir, 'extracted');

  console.log(`${DATASET_LABEL}: ダウンロード中…`);
  pipeline.downloadZip(ZIP_URL, zipPath);
  pipeline.extractZip(zipPath, extractDir);

  const shapeFile = pipeline.findFileBySuffix(extractDir, '_Stream.shp');
  if (!shapeFile) {
    throw new Error(`${DATASET_LABEL}: 展開したzipの中にStream.shpが見つかりませんでした`);
  }

  const rawGeoJsonPath = path.join(workDir, 'raw.geojson');
  const boundary = pipeline.readGeoJson(ADMIN_BOUNDARY_PATH);
  if (boundary.features.length === 0) {
    throw new Error(`${DATASET_LABEL}: 先に行政区域データを生成してください`);
  }
  console.log(`${DATASET_LABEL}: GeoJSONへ変換・愛知県行政界でクリップ中…`);
  pipeline.convertToGeoJson(shapeFile, rawGeoJsonPath, { clipPath: ADMIN_BOUNDARY_PATH });

  const raw = pipeline.readGeoJson(rawGeoJsonPath);
  const filtered = raw.features.filter(
    (feature) => ALLOWED_GEOMETRY_TYPES.includes(feature?.geometry?.type),
  );

  if (filtered.length === 0) {
    throw new Error(`${DATASET_LABEL}: Featureが0件でした。ダウンロードしたzipの中身を確認してください。`);
  }

  const collection = {
    type: 'FeatureCollection',
    name: 'aichi-river',
    metadata: {
      schemaVersion: 1,
      layerType: 'river',
      sourceName: '国土数値情報（河川）国土交通省',
      dataset: 'W05-2008',
      sourceUrl: ZIP_URL,
      license: '非商用',
      distribution: 'Internal / Local QA only; do not commit or publish',
      clipBoundary: 'N03-2025 愛知県行政区域',
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

module.exports = { OUTPUT_PATH };
