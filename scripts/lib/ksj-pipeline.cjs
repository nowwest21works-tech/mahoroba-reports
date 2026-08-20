#!/usr/bin/env node
'use strict';

// ========== 国土数値情報（KSJ）取得共通パイプライン ==========
//
// 【重要・実行前に必ず読んでください】
// このモジュールは Codex / 今西さんのローカル環境など、nlftp.mlit.go.jp へ
// ネットワーク到達できる環境での実行を前提にしている。
// 2026-08-20にnlftp.mlit.go.jpの公式sourceからN03/N02/N13/W05を生成・検証済み。
// W05生成物は非商用のためInternal / Local QA専用とし、public配布しない。
//
// 依存コマンド（実行環境に事前インストールが必要）：
//   - curl（zipのダウンロード）
//   - unzip（zipの展開）
//   - mapshaper（shapefile/GML → GeoJSON変換・フィールドフィルタ）
//     未導入の場合：npm install --save-dev mapshaper
//
// 生成AIによる形状の推測・捏造をしない、という受入条件を満たすため、
// このパイプラインは常に「国土数値情報からダウンロードした実データを変換するだけ」
// で完結し、座標やジオメトリを一切生成しない。

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function assertUrlConfigured(url, datasetLabel) {
  if (!url || url.includes('REPLACE_ME')) {
    throw new Error(
      `${datasetLabel}: ダウンロードURLが未設定です。`
      + 'nlftp.mlit.go.jp のダウンロードページで実際のURLを確認し、'
      + 'スクリプト冒頭の定数を置き換えてから再実行してください。',
    );
  }
}

function makeWorkDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function downloadZip(url, destZipPath) {
  execFileSync('curl', ['-fSL', '--retry', '3', '-o', destZipPath, url], {
    stdio: 'inherit',
  });
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'inherit' });
    return;
  }
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir], { stdio: 'inherit' });
}

function findFileByExtension(rootDir, extensions) {
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        return fullPath;
      }
    }
  }
  return null;
}

function findFileBySuffix(rootDir, suffix) {
  const stack = [rootDir];
  const normalizedSuffix = suffix.toLowerCase();
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name.toLowerCase().endsWith(normalizedSuffix)) {
        return fullPath;
      }
    }
  }
  return null;
}

// mapshaperでSJIS shapefile / GML(JPGIS)をWGS84 GeoJSONへ変換する。
// -simplify は行わない。道路の表示軽量化は元座標を維持したFeature集約で行う。
function convertToGeoJson(
  inputPath,
  outputPath,
  { encoding = 'sjis', clipBbox = null, clipPath = null, filterExpression = null } = {},
) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const args = [
    inputPath,
    'encoding=' + encoding,
    '-proj', 'wgs84',
  ];
  if (filterExpression) {
    args.push('-filter', filterExpression);
  }
  if (clipPath) {
    args.push('-clip', clipPath);
  }
  if (clipBbox) {
    const { west, south, east, north } = clipBbox;
    args.push('-clip', `bbox=${west},${south},${east},${north}`);
  }
  args.push('-o', 'format=geojson', 'precision=0.000001', outputPath);
  const mapshaperCli = path.resolve(
    __dirname,
    '../../node_modules/mapshaper/bin/mapshaper',
  );
  execFileSync(process.execPath, [mapshaperCli, ...args], { stdio: 'inherit' });
}

function readGeoJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const collection = JSON.parse(raw);
  if (collection?.type === 'GeometryCollection' && collection.geometries?.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error(`${filePath}: FeatureCollection形式ではありません`);
  }
  return collection;
}

function writeGeoJson(filePath, collection) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(collection)}\n`, 'utf8');
}

module.exports = {
  assertUrlConfigured,
  makeWorkDir,
  downloadZip,
  extractZip,
  findFileByExtension,
  findFileBySuffix,
  convertToGeoJson,
  readGeoJson,
  writeGeoJson,
};
