const path = require('node:path');

const APP_PATH = '/mahoroba-reports/map-circles/';
const APP_ORIGIN = 'http://127.0.0.1:4173';
const TRANSPARENT_TILE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
  'utf8',
);

const LEAFLET_JS = require.resolve('leaflet/dist/leaflet.js');
const LEAFLET_CSS = require.resolve('leaflet/dist/leaflet.css');
const GEOMAN_JS = require.resolve('@geoman-io/leaflet-geoman-free');
const GEOMAN_CSS = require.resolve(
  '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css',
);

async function installNetworkSandbox(page, options = {}) {
  const audit = {
    geomanRequests: [],
    nominatimRequests: [],
    tileRequests: [],
    unexpectedExternal: [],
  };

  await page.route(/^https?:\/\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === APP_ORIGIN) {
      await route.continue();
      return;
    }

    audit.unexpectedExternal.push(route.request().url());
    await route.abort('blockedbyclient');
  });

  await page.route('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript; charset=utf-8',
      path: LEAFLET_JS,
    }),
  );

  await page.route('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', (route) =>
    route.fulfill({
      contentType: 'text/css; charset=utf-8',
      path: LEAFLET_CSS,
    }),
  );

  await page.route(
    'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.20.0/dist/leaflet-geoman.js',
    (route) => {
      audit.geomanRequests.push(route.request().url());
      return route.fulfill({
        contentType: 'text/javascript; charset=utf-8',
        path: GEOMAN_JS,
      });
    },
  );

  await page.route(
    'https://unpkg.com/@geoman-io/leaflet-geoman-free@2.20.0/dist/leaflet-geoman.css',
    (route) => {
      audit.geomanRequests.push(route.request().url());
      return route.fulfill({
        contentType: 'text/css; charset=utf-8',
        path: GEOMAN_CSS,
      });
    },
  );

  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({
      body: '',
      contentType: 'text/css; charset=utf-8',
      status: 200,
    }),
  );

  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({
      body: Buffer.alloc(0),
      contentType: 'font/woff2',
      status: 200,
    }),
  );

  await page.route(/https:\/\/[^/]+\.tile\.openstreetmap\.org\/.*/, (route) => {
    audit.tileRequests.push(route.request().url());
    return route.fulfill({
      body: TRANSPARENT_TILE,
      contentType: 'image/svg+xml',
      status: 200,
    });
  });

  await page.route('https://disaportaldata.gsi.go.jp/**', (route) => {
    audit.tileRequests.push(route.request().url());
    return route.fulfill({
      body: TRANSPARENT_TILE,
      contentType: 'image/svg+xml',
      status: 200,
    });
  });

  await page.route('https://nominatim.openstreetmap.org/**', (route) => {
    audit.nominatimRequests.push(route.request().url());
    const response = options.nominatimResponse || {
      body: JSON.stringify([]),
      status: 200,
    };

    return route.fulfill({
      body: response.body,
      contentType: 'application/json; charset=utf-8',
      status: response.status,
    });
  });

  return audit;
}

async function openMap(page, options = {}) {
  const audit = await installNetworkSandbox(page, options);
  await page.goto(APP_PATH);
  await page.locator('#map.leaflet-container').waitFor();
  return audit;
}

async function clickMap(page, xRatio = 0.5, yRatio = 0.5) {
  const box = await page.locator('#map').boundingBox();
  if (!box) {
    throw new Error('Map bounding box is unavailable');
  }

  await page.mouse.click(
    box.x + box.width * xRatio,
    box.y + box.height * yRatio,
  );
}

async function getMapState(page) {
  return page.evaluate(() => ({
    center: [map.getCenter().lat, map.getCenter().lng],
    zoom: map.getZoom(),
    circles: circles.map((item) => ({
      center: item.center,
      color: item.color,
      featureId: item.featureId,
      label: item.label,
      radius: item.radius,
    })),
  }));
}

async function getAppState(page) {
  return page.evaluate(() => ({
    mapProject: MapCirclesAppState.getCurrentMapProject(),
    snapshot: MapCirclesAppState.getSnapshot(),
  }));
}

function fixturePath(fileName) {
  return path.resolve(__dirname, '..', 'fixtures', fileName);
}

module.exports = {
  APP_PATH,
  clickMap,
  fixturePath,
  getAppState,
  getMapState,
  installNetworkSandbox,
  openMap,
};
