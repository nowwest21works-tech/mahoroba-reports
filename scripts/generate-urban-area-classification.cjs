#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  REFERENCE_YEAR,
  SOURCE_DATASET,
  SOURCE_NAME,
  normalizeFeature,
} = require('../journey-map/js/urban-area-classification-domain.js');

const API_ENDPOINT =
  'https://www.reinfolib.mlit.go.jp/ex-api/external/XKT001';
const AICHI_BOUNDS = Object.freeze({
  west: 136.66,
  south: 34.56,
  east: 137.84,
  north: 35.43,
});
const DEFAULT_ZOOM = 11;
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  '../journey-map/data/urban-area-classification/aichi.geojson',
);
const REQUIRED_ENV = 'REINFOLIB_API_KEY';

function longitudeToTileX(longitude, zoom) {
  return Math.floor(((longitude + 180) / 360) * (2 ** zoom));
}

function latitudeToTileY(latitude, zoom) {
  const radians = latitude * Math.PI / 180;
  return Math.floor(
    (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * (2 ** zoom),
  );
}

function tileRange(bounds = AICHI_BOUNDS, zoom = DEFAULT_ZOOM) {
  const minX = longitudeToTileX(bounds.west, zoom);
  const maxX = longitudeToTileX(bounds.east, zoom);
  const minY = latitudeToTileY(bounds.north, zoom);
  const maxY = latitudeToTileY(bounds.south, zoom);
  const tiles = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) tiles.push({ x, y, z: zoom });
  }
  return tiles;
}

function squaredDistance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyOpenLine(points, squaredTolerance) {
  if (points.length <= 2) return points.slice();
  const kept = new Uint8Array(points.length);
  const stack = [[0, points.length - 1]];
  kept[0] = 1;
  kept[points.length - 1] = 1;
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDistance = squaredTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const distance = squaredSegmentDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        index = i;
        maxDistance = distance;
      }
    }
    if (index !== -1) {
      kept[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, index) => kept[index]);
}

function simplifyRing(ring, tolerance) {
  if (!tolerance || ring.length <= 5) return ring;
  const unclosed = ring.slice(0, -1);
  let simplified = simplifyOpenLine(unclosed, tolerance * tolerance);
  if (simplified.length < 3) return ring;
  if (squaredDistance(simplified[0], simplified.at(-1)) === 0) {
    simplified = simplified.slice(0, -1);
  }
  if (simplified.length < 3) return ring;
  return [...simplified, simplified[0]];
}

function simplifyGeometry(geometry, tolerance) {
  if (!tolerance) return geometry;
  const simplifyPolygon = (polygon) =>
    polygon.map((ring) => simplifyRing(ring, tolerance));
  return {
    ...geometry,
    coordinates: geometry.type === 'Polygon'
      ? simplifyPolygon(geometry.coordinates)
      : geometry.coordinates.map(simplifyPolygon),
  };
}

function parseArguments(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    tolerance: 0,
    zoom: DEFAULT_ZOOM,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output') options.output = path.resolve(argv[++index]);
    else if (value === '--tolerance') options.tolerance = Number(argv[++index]);
    else if (value === '--zoom') options.zoom = Number(argv[++index]);
    else throw new Error(`未対応の引数です: ${value}`);
  }
  if (!Number.isInteger(options.zoom) || options.zoom < 11 || options.zoom > 15) {
    throw new Error('--zoom は11〜15の整数で指定してください');
  }
  if (!Number.isFinite(options.tolerance) || options.tolerance < 0) {
    throw new Error('--tolerance は0以上の数値で指定してください');
  }
  return options;
}

async function fetchTile(tile, apiKey) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set('response_format', 'geojson');
  url.searchParams.set('z', String(tile.z));
  url.searchParams.set('x', String(tile.x));
  url.searchParams.set('y', String(tile.y));
  const response = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  });
  if (!response.ok) {
    throw new Error(`XKT001 ${tile.z}/${tile.x}/${tile.y}: HTTP ${response.status}`);
  }
  const collection = await response.json();
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error(`XKT001 ${tile.z}/${tile.x}/${tile.y}: GeoJSON形式が不正です`);
  }
  return collection.features;
}

function featureSignature(feature) {
  return JSON.stringify([feature.geometry, feature.properties]);
}

async function generate(options, apiKey) {
  const tiles = tileRange(AICHI_BOUNDS, options.zoom);
  const uniqueFeatures = new Map();
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    process.stdout.write(`\rXKT001を取得中 ${index + 1}/${tiles.length}`);
    const rawFeatures = await fetchTile(tile, apiKey);
    for (const rawFeature of rawFeatures) {
      if (rawFeature?.properties?.prefecture !== '愛知県') continue;
      if (!['Polygon', 'MultiPolygon'].includes(rawFeature?.geometry?.type)) continue;
      const normalized = normalizeFeature(rawFeature, { referenceYear: REFERENCE_YEAR });
      normalized.geometry = simplifyGeometry(normalized.geometry, options.tolerance);
      uniqueFeatures.set(featureSignature(normalized), normalized);
    }
    if (index + 1 < tiles.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  process.stdout.write('\n');

  const collection = {
    type: 'FeatureCollection',
    name: 'aichi-urban-area-classification',
    metadata: {
      schemaVersion: 1,
      layerType: 'urban-area-classification',
      sourceName: SOURCE_NAME,
      sourceDataset: SOURCE_DATASET,
      referenceYear: REFERENCE_YEAR,
      apiZoom: options.zoom,
      simplificationToleranceDegrees: options.tolerance,
      generatedAt: new Date().toISOString(),
      featureCount: uniqueFeatures.size,
    },
    features: [...uniqueFeatures.values()],
  };
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(collection)}\n`, 'utf8');
  return {
    output: options.output,
    tiles: tiles.length,
    features: uniqueFeatures.size,
    bytes: Buffer.byteLength(JSON.stringify(collection)),
  };
}

async function main() {
  const apiKey = process.env[REQUIRED_ENV];
  if (!apiKey) {
    throw new Error(
      `${REQUIRED_ENV} が未設定です。APIキーを環境変数へ設定してから再実行してください。`,
    );
  }
  const result = await generate(parseArguments(process.argv.slice(2)), apiKey);
  console.log(`生成先: ${result.output}`);
  console.log(`取得タイル: ${result.tiles}`);
  console.log(`Feature数: ${result.features}`);
  console.log(`生成容量: ${result.bytes} bytes`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  AICHI_BOUNDS,
  DEFAULT_OUTPUT,
  DEFAULT_ZOOM,
  REQUIRED_ENV,
  generate,
  parseArguments,
  simplifyGeometry,
  tileRange,
};
