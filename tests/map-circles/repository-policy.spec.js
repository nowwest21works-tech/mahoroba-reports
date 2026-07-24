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
const INDEX_PATH = path.join(REPOSITORY_ROOT, 'map-circles', 'index.html');
const TEST_ROOT = path.join(REPOSITORY_ROOT, 'tests', 'map-circles');
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
    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const audit = await openMap(page);

    expect(new URL(page.url()).pathname).toBe(baseline.pagesPath);
    await expect(page).toHaveTitle(baseline.title);
    expect(audit.unexpectedExternal).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('index.htmlのbyte列をPR1 baselineから変更しない', () => {
    const source = fs.readFileSync(INDEX_PATH);
    const hash = crypto.createHash('sha256').update(source).digest('hex');
    expect(hash).toBe(baseline.indexSha256);
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

test.describe('test data PII guard', () => {
  test('fixtureとtest sourceに個人情報形式や禁止fieldを含めない', () => {
    const files = walkFiles(TEST_ROOT).filter((filePath) =>
      /\.(?:js|json)$/.test(filePath),
    );
    const fixtureFiles = files.filter((filePath) =>
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
