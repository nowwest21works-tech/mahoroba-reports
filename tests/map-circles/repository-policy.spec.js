const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const {
  APP_PATH,
  fixturePath,
  openMap,
} = require('./support/map-test-helpers');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const PRODUCT_ROOT = path.join(REPOSITORY_ROOT, 'map-circles');
const INDEX_PATH = path.join(PRODUCT_ROOT, 'index.html');
const TEST_ROOT = path.join(REPOSITORY_ROOT, 'tests', 'map-circles');
const EXPECTED_STYLESHEETS = [
  './styles/tokens.css',
  './styles/layout.css',
  './styles/components.css',
];
const EXPECTED_SCRIPTS = [
  './js/config.js',
  './js/domain.js',
  './js/memory-store.js',
  './js/geojson-adapter.js',
  './js/map.js',
  './js/circles.js',
  './js/ui.js',
  './js/geocoder.js',
  './js/hazards.js',
  './js/app.js',
];
const baseline = JSON.parse(
  fs.readFileSync(fixturePath('product-baseline.json'), 'utf8'),
);

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

test.describe('GitHub Pages互換と製品source固定', () => {
  test('repository名を含むPages pathから読み込める', async ({ page }) => {
    const audit = await openMap(page);

    expect(new URL(page.url()).pathname).toBe(baseline.pagesPath);
    await expect(page).toHaveTitle(baseline.title);
    expect(audit.unexpectedExternal).toEqual([]);
  });

  test('責務分離後の製品asset一式がbaselineと一致する', () => {
    const actualAssets = walkFiles(PRODUCT_ROOT)
      .filter((filePath) => /\.(?:html|css|js)$/.test(filePath))
      .map((filePath) => path.relative(PRODUCT_ROOT, filePath).split(path.sep).join('/'))
      .sort();

    expect(actualAssets).toEqual(Object.keys(baseline.assetSha256).sort());

    for (const [relativePath, expectedHash] of Object.entries(baseline.assetSha256)) {
      const source = fs
        .readFileSync(path.join(PRODUCT_ROOT, relativePath), 'utf8')
        .replace(/\r\n/g, '\n');
      const hash = crypto.createHash('sha256').update(source).digest('hex');
      expect(hash, relativePath).toBe(expectedHash);
    }
  });

  test('CSSとJavaScriptを相対パスから責務順に読み込む', () => {
    const source = fs.readFileSync(INDEX_PATH, 'utf8');
    const localStylesheets = [
      ...source.matchAll(/\bhref=["'](\.\/styles\/[^"']+\.css)["']/g),
    ].map((match) => match[1]);
    const localScripts = [
      ...source.matchAll(/\bsrc=["'](\.\/js\/[^"']+\.js)["']/g),
    ].map((match) => match[1]);
    const applicationScriptTags = [
      ...source.matchAll(/<script\b([^>]*)>/g),
    ].filter((match) => !match[1].includes('leaflet.min.js'));

    expect(source).not.toMatch(/<style(?:\s|>)/);
    expect(applicationScriptTags.every((match) => /\bsrc=/.test(match[1]))).toBe(true);
    expect(applicationScriptTags.every((match) => /\bdefer\b/.test(match[1]))).toBe(true);
    expect(localStylesheets).toEqual(EXPECTED_STYLESHEETS);
    expect(localScripts).toEqual(EXPECTED_SCRIPTS);
  });

  test('Pages配下の製品assetが200で読み込まれ、初期表示にconsole errorがない', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const localResponses = new Map();

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith(APP_PATH)) localResponses.set(pathname, response.status());
    });

    await openMap(page);

    const expectedPaths = [
      APP_PATH,
      ...EXPECTED_STYLESHEETS.map((asset) => `${APP_PATH}${asset.slice(2)}`),
      ...EXPECTED_SCRIPTS.map((asset) => `${APP_PATH}${asset.slice(2)}`),
    ];

    expect(Object.fromEntries(
      expectedPaths.map((pathname) => [pathname, localResponses.get(pathname)]),
    )).toEqual(Object.fromEntries(
      expectedPaths.map((pathname) => [pathname, 200]),
    ));
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('root絶対パスのlocal asset参照を持たない', () => {
    const source = fs.readFileSync(INDEX_PATH, 'utf8');
    const rootAbsoluteReferences = [
      ...source.matchAll(/\b(?:href|src)=["'](\/(?!\/)[^"']*)["']/g),
    ].map((match) => match[1]);

    expect(rootAbsoluteReferences).toEqual([]);
    expect(APP_PATH).toBe('/mahoroba-reports/map-circles/');
  });
});

test.describe('製品とtest dataのPII guard', () => {
  test('製品source、fixture、test sourceに個人情報形式や禁止fieldを含めない', () => {
    const testFiles = walkFiles(TEST_ROOT).filter((filePath) =>
      /\.(?:js|json)$/.test(filePath),
    );
    const productFiles = walkFiles(PRODUCT_ROOT).filter((filePath) =>
      /\.(?:html|css|js)$/.test(filePath),
    );
    const files = [...testFiles, ...productFiles];
    const fixtureFiles = testFiles.filter((filePath) =>
      filePath.includes(`${path.sep}fixtures${path.sep}`),
    );
    const combined = files
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n');
    const fixtureContent = fixtureFiles
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n');

    const piiLikePatterns = [
      /〒?\d{3}-\d{4}/,
      /\b0\d{1,4}-\d{1,4}-\d{3,4}\b/,
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    ];

    for (const pattern of piiLikePatterns) {
      expect(combined, `PII-like pattern found: ${pattern}`).not.toMatch(pattern);
    }

    expect(fixtureContent).not.toMatch(
      /\b(?:customerName|customer_name|homeAddress|home_address|workplace|employer)\b/i,
    );

    const successFixture = JSON.parse(
      fs.readFileSync(fixturePath('nominatim-success.json'), 'utf8'),
    );
    expect(successFixture[0].display_name).toContain('架空');
  });
});
