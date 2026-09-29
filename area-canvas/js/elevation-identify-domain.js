((globalThis) => {
  const DEMS = Object.freeze([
    { id: 'DEM1A', path: 'dem1a_png', zoom: 17, decimals: 1, source: '航空レーザ測量' },
    { id: 'DEM5A', path: 'dem5a_png', zoom: 15, decimals: 1, source: '航空レーザ測量' },
    { id: 'DEM5B', path: 'dem5b_png', zoom: 15, decimals: 1, source: '写真測量' },
    { id: 'DEM5C', path: 'dem5c_png', zoom: 15, decimals: 1, source: '写真測量' },
    { id: 'DEM10B', path: 'dem_png', zoom: 14, decimals: 0, source: '地形図等高線' },
  ]);

  function decodePixel(red, green, blue, alpha = 255) {
    if (![red, green, blue, alpha].every(Number.isInteger)
      || red < 0 || red > 255 || green < 0 || green > 255 || blue < 0 || blue > 255
      || alpha < 1 || alpha > 255 || (red === 128 && green === 0 && blue === 0)) return null;
    const encoded = (red * 65536) + (green * 256) + blue;
    if (encoded === 8388608) return null;
    const meters = encoded < 8388608 ? encoded * 0.01 : (encoded - 16777216) * 0.01;
    return Number.isFinite(meters) ? meters : null;
  }

  function pixelFor(map, latlng, zoom) {
    if (!map || !latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)
      || !Number.isInteger(zoom) || zoom < 0 || zoom > 22) return null;
    const point = map.project(latlng, zoom);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const tileX = Math.floor(point.x / 256);
    const tileY = Math.floor(point.y / 256);
    const pixelX = Math.floor(point.x - tileX * 256);
    const pixelY = Math.floor(point.y - tileY * 256);
    if (pixelX < 0 || pixelX > 255 || pixelY < 0 || pixelY > 255) return null;
    return { x: tileX, y: tileY, pixelX, pixelY };
  }

  function tileUrl(dem, tile) {
    if (!dem || !DEMS.includes(dem) || !tile
      || ![tile.x, tile.y].every(Number.isInteger)) return null;
    return `https://cyberjapandata.gsi.go.jp/xyz/${dem.path}/${dem.zoom}/${tile.x}/${tile.y}.png`;
  }

  const api = Object.freeze({ DEMS, decodePixel, pixelFor, tileUrl });
  globalThis.ElevationIdentifyDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
