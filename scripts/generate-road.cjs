#!/usr/bin/env node
'use strict';

// ========== 道路データ（国土数値情報 N13）生成 ==========
// data/road/aichi.geojson を作る。
// N13には路線名（国道◯号 等）の属性が無いため、名称表示は
// area-canvas/data/road/route-labels.json への手動登録で別途補う（①の決定）。
// 生成手順・注意事項は scripts/lib/ksj-pipeline.cjs の冒頭コメントを参照。

const path = require('node:path');
const pipeline = require('./lib/ksj-pipeline.cjs');

const DATASET_LABEL = '道路データ(N13)';

// 要確認：都道府県別ダウンロードか全国一括かはデータセットにより異なる。
// 参照ページ: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N13-2024.html
const ZIP_URLS = [
  'https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/N13-24_5136_GEOJSON.zip',
  'https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/N13-24_5137_GEOJSON.zip',
  'https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/N13-24_5236_GEOJSON.zip',
  'https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/N13-24_5237_GEOJSON.zip',
  'https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/N13-24_5336_GEOJSON.zip',
  'https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/N13-24_5337_GEOJSON.zip',
];

const OUTPUT_PATH = path.resolve(__dirname, '../area-canvas/data/road/aichi.geojson');
const ADMIN_BOUNDARY_PATH = path.resolve(
  __dirname,
  '../area-canvas/data/administrative-boundary/aichi.geojson',
);

const AICHI_BBOX = { west: 136.68, south: 34.57, east: 137.85, north: 35.40 };
const ALLOWED_GEOMETRY_TYPES = ['LineString', 'MultiLineString'];

// v0.1表示対象は「高速道路・都市高速」「国道」「主要県道」に限定し、
// 市区町村道・細街路は含めない（手書き余白を確保する設計原則）。
// 属性値の実際の文字列は取得後に必ず確認し、このリストを実データに合わせて調整すること。
const ALLOWED_ROUTE_CLASS_VALUES = ['1', '2', '4'];
const ROUTE_CLASS_FIELD_CANDIDATES = ['N13_003'];
const ROUTE_CLASS_LABELS = {
  1: '国道',
  2: '都道府県道',
  4: '高速自動車国道等',
};

function routeClassOf(properties) {
  for (const field of ROUTE_CLASS_FIELD_CANDIDATES) {
    if (properties[field] !== undefined) return String(properties[field]);
  }
  return null;
}

function isTargetRoad(properties) {
  const routeClass = routeClassOf(properties);
  if (routeClass === null) return false;
  return ALLOWED_ROUTE_CLASS_VALUES.includes(routeClass);
}

function coordinateCount(coordinates) {
  if (!Array.isArray(coordinates)) return 0;
  if (
    coordinates.length >= 2
    && typeof coordinates[0] === 'number'
    && typeof coordinates[1] === 'number'
  ) {
    return 1;
  }
  return coordinates.reduce((total, item) => total + coordinateCount(item), 0);
}

function lineStringsOf(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function aggregateRoadFeatures(features) {
  const groups = new Map(ALLOWED_ROUTE_CLASS_VALUES.map((code) => [code, {
    lines: [],
    sourceFeatureCount: 0,
  }]));
  let sourceCoordinateCount = 0;
  let sourceLinePartCount = 0;

  for (const feature of features) {
    const routeClass = routeClassOf(feature.properties || {});
    const group = groups.get(routeClass);
    if (!group) continue;
    const lines = lineStringsOf(feature.geometry);
    if (lines.length === 0) continue;
    group.lines.push(...lines);
    group.sourceFeatureCount += 1;
    sourceLinePartCount += lines.length;
    sourceCoordinateCount += coordinateCount(feature.geometry.coordinates);
  }

  const aggregatedFeatures = ALLOWED_ROUTE_CLASS_VALUES.map((routeClass) => {
    const group = groups.get(routeClass);
    if (group.lines.length === 0) return null;
    return {
      type: 'Feature',
      properties: {
        N13_003: routeClass,
        routeClassLabel: ROUTE_CLASS_LABELS[routeClass],
        sourceFeatureCount: group.sourceFeatureCount,
      },
      geometry: {
        type: 'MultiLineString',
        coordinates: group.lines,
      },
    };
  }).filter(Boolean);

  return {
    features: aggregatedFeatures,
    sourceCoordinateCount,
    sourceFeatureCount: features.length,
    sourceLinePartCount,
  };
}

async function main() {
  ZIP_URLS.forEach((url) => pipeline.assertUrlConfigured(url, DATASET_LABEL));
  const workDir = pipeline.makeWorkDir('n13');
  const boundary = pipeline.readGeoJson(ADMIN_BOUNDARY_PATH);
  if (boundary.features.length === 0) {
    throw new Error(`${DATASET_LABEL}: 先に行政区域データを生成してください`);
  }

  const filtered = [];
  for (const [index, url] of ZIP_URLS.entries()) {
    const zipPath = path.join(workDir, `n13-${index}.zip`);
    const extractDir = path.join(workDir, `extracted-${index}`);
    console.log(`${DATASET_LABEL}: ${path.basename(url)}をダウンロード中…`);
    pipeline.downloadZip(url, zipPath);
    pipeline.extractZip(zipPath, extractDir);
    const sourceGeoJson = pipeline.findFileByExtension(extractDir, ['.geojson']);
    if (!sourceGeoJson) {
      throw new Error(`${DATASET_LABEL}: ${path.basename(url)}にGeoJSONが見つかりませんでした`);
    }
    const clippedPath = path.join(workDir, `clipped-${index}.geojson`);
    pipeline.convertToGeoJson(sourceGeoJson, clippedPath, {
      encoding: 'utf8',
      clipPath: ADMIN_BOUNDARY_PATH,
      filterExpression: 'N13_003 == "1" || N13_003 == "2" || N13_003 == "4"',
    });
    const clipped = pipeline.readGeoJson(clippedPath);
    filtered.push(...clipped.features.filter(
      (feature) => ALLOWED_GEOMETRY_TYPES.includes(feature?.geometry?.type)
        && isTargetRoad(feature.properties || {}),
    ));
  }

  if (filtered.length === 0) {
    throw new Error(
      `${DATASET_LABEL}: 対象路線区分のFeatureが0件でした。`
      + 'ROUTE_CLASS_FIELD_CANDIDATES / ALLOWED_ROUTE_CLASS_VALUESを実データの属性値に合わせて調整してください。',
    );
  }

  const aggregated = aggregateRoadFeatures(filtered);
  const collection = {
    type: 'FeatureCollection',
    name: 'aichi-road',
    metadata: {
      schemaVersion: 1,
      layerType: 'road',
      sourceName: '国土数値情報（道路）国土交通省',
      dataset: 'N13-2024',
      sourceUrls: ZIP_URLS,
      license: 'CC BY 4.0',
      note: '路線名(国道◯号等)の属性なし。表示名はroute-labels.jsonの手動登録で補う',
      routeClassField: 'N13_003',
      includedRouteClassCodes: ALLOWED_ROUTE_CLASS_VALUES,
      clipBoundary: 'N03-2025 愛知県行政区域',
      aggregation: 'N13_003ごとのMultiLineString（座標削減・簡略化なし）',
      simplificationToleranceDegrees: 0,
      sourceFeatureCount: aggregated.sourceFeatureCount,
      sourceLinePartCount: aggregated.sourceLinePartCount,
      sourceCoordinateCount: aggregated.sourceCoordinateCount,
      generatedAt: new Date().toISOString(),
      featureCount: aggregated.features.length,
    },
    features: aggregated.features,
  };
  pipeline.writeGeoJson(OUTPUT_PATH, collection);
  console.log(`生成先: ${OUTPUT_PATH}`);
  console.log(`Source Feature数: ${aggregated.sourceFeatureCount}`);
  console.log(`表示用Feature数: ${aggregated.features.length}`);
  console.log(`座標数（簡略化なし）: ${aggregated.sourceCoordinateCount}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  OUTPUT_PATH,
  ZIP_URLS,
  ROUTE_CLASS_FIELD_CANDIDATES,
  ALLOWED_ROUTE_CLASS_VALUES,
  aggregateRoadFeatures,
  coordinateCount,
  isTargetRoad,
};
