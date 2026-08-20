#!/usr/bin/env node
'use strict';

// ========== 鉄道データ（国土数値情報 N02-2022）生成 ==========
// data/railway/aichi.geojson を作る。
// N02は都道府県別ではなく全国一括ファイルのため、愛知県のバウンディングボックスで
// クリップする（行政界そのものでの正確な切り抜きではない点に留意）。
// 生成手順・注意事項は scripts/lib/ksj-pipeline.cjs の冒頭コメントを参照。

const path = require('node:path');
const pipeline = require('./lib/ksj-pipeline.cjs');

const DATASET_LABEL = '鉄道データ(N02-2022)';

// 要確認：下記の datalist ページでGeoJSON形式の直接ダウンロードリンクがあれば
// そちらを優先する（shapefile変換の手間を省ける）。全国一括・約16.7MB。
// 参照ページ: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2022.html
const ZIP_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-22/N02-22_GML.zip';

const OUTPUT_PATH = path.resolve(__dirname, '../area-canvas/data/railway/aichi.geojson');
const ADMIN_BOUNDARY_PATH = path.resolve(
  __dirname,
  '../area-canvas/data/administrative-boundary/aichi.geojson',
);

// 表示対象を「路線」と「駅」のみに絞る（線路施設の詳細区分は不要）。
const ALLOWED_GEOMETRY_TYPES = ['LineString', 'MultiLineString', 'Point', 'MultiPoint'];

const AICHI_BBOX = { west: 136.68, south: 34.57, east: 137.85, north: 35.40 };

async function main() {
  pipeline.assertUrlConfigured(ZIP_URL, DATASET_LABEL);
  const workDir = pipeline.makeWorkDir('n02');
  const zipPath = path.join(workDir, 'n02.zip');
  const extractDir = path.join(workDir, 'extracted');

  console.log(`${DATASET_LABEL}: ダウンロード中…`);
  pipeline.downloadZip(ZIP_URL, zipPath);
  pipeline.extractZip(zipPath, extractDir);

  const boundary = pipeline.readGeoJson(ADMIN_BOUNDARY_PATH);
  if (boundary.features.length === 0) {
    throw new Error(`${DATASET_LABEL}: 先に行政区域データを生成してください`);
  }

  const utf8Dir = path.join(extractDir, 'UTF-8');
  const sourceFiles = [
    path.join(utf8Dir, 'N02-22_RailroadSection.geojson'),
    path.join(utf8Dir, 'N02-22_Station.geojson'),
  ];
  if (sourceFiles.some((filePath) => !require('node:fs').existsSync(filePath))) {
    throw new Error(`${DATASET_LABEL}: UTF-8版の路線・駅GeoJSONが見つかりませんでした`);
  }

  const filtered = [];
  for (const [index, sourceFile] of sourceFiles.entries()) {
    const clippedPath = path.join(workDir, `clipped-${index}.geojson`);
    console.log(`${DATASET_LABEL}: ${path.basename(sourceFile)}を愛知県行政界でクリップ中…`);
    pipeline.convertToGeoJson(sourceFile, clippedPath, {
      encoding: 'utf8',
      clipPath: ADMIN_BOUNDARY_PATH,
    });
    const clipped = pipeline.readGeoJson(clippedPath);
    filtered.push(...clipped.features.filter(
      (feature) => ALLOWED_GEOMETRY_TYPES.includes(feature?.geometry?.type),
    ));
  }

  if (filtered.length === 0) {
    throw new Error(`${DATASET_LABEL}: 愛知県周辺のFeatureが0件でした。クリップ範囲を確認してください。`);
  }

  const collection = {
    type: 'FeatureCollection',
    name: 'aichi-railway',
    metadata: {
      schemaVersion: 1,
      layerType: 'railway',
      sourceName: '国土数値情報（鉄道）国土交通省 2022年度版',
      dataset: 'N02-2022',
      sourceUrl: ZIP_URL,
      license: '国土数値情報ダウンロードサイト利用規約（オープンデータ）',
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

module.exports = { OUTPUT_PATH, AICHI_BBOX, ADMIN_BOUNDARY_PATH };
