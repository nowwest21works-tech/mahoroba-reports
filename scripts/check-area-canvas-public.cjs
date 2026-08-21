#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const W05_OUTPUT = 'area-canvas/data/river/aichi.geojson';
const RIVER_DATA_PATTERN = /^area-canvas\/data\/river\/.*\.(?:dbf|geojson|json|prj|shp|shx|zip)$/i;

function trackedRiverDataFiles(trackedFiles) {
  return trackedFiles.filter((filePath) => RIVER_DATA_PATTERN.test(filePath));
}

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function main() {
  const trackedFiles = gitOutput(['ls-files', '-z']).split('\0').filter(Boolean);
  const violations = trackedRiverDataFiles(trackedFiles);
  if (violations.length > 0) {
    throw new Error(`Public境界違反: W05由来の河川データがGit追跡対象です: ${violations.join(', ')}`);
  }

  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', W05_OUTPUT], {
      cwd: REPOSITORY_ROOT,
      stdio: 'ignore',
    });
  } catch {
    throw new Error(`Public境界違反: ${W05_OUTPUT} が.gitignore対象ではありません`);
  }

  console.log(`Public境界OK: ${W05_OUTPUT} はignore済み・Git追跡なし`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { RIVER_DATA_PATTERN, trackedRiverDataFiles };
