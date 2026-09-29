((globalThis) => {
  async function readTile(url, pixel, fetchImpl, bitmapImpl) {
    const response = await fetchImpl(url, { mode: 'cors' });
    if (response.status === 404 || response.status === 204) return { kind: 'missing' };
    if (!response.ok) throw new Error('DEM request failed');
    const blob = await response.blob();
    const bitmap = await bitmapImpl(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(bitmap, 0, 0);
      const [red, green, blue, alpha] = context.getImageData(pixel.pixelX, pixel.pixelY, 1, 1).data;
      const elevation = ElevationIdentifyDomain.decodePixel(red, green, blue, alpha);
      return elevation === null ? { kind: 'no-data' } : { kind: 'value', elevation };
    } finally {
      bitmap.close?.();
    }
  }

  async function identify(map, latlng, {
    fetchImpl = globalThis.fetch,
    bitmapImpl = globalThis.createImageBitmap,
  } = {}) {
    if (typeof fetchImpl !== 'function' || typeof bitmapImpl !== 'function') {
      return { status: 'UNAVAILABLE', value: null, dem: null };
    }
    let hadRequestFailure = false;
    let hadCoverage = false;
    for (const dem of ElevationIdentifyDomain.DEMS) {
      const pixel = ElevationIdentifyDomain.pixelFor(map, latlng, dem.zoom);
      const url = ElevationIdentifyDomain.tileUrl(dem, pixel);
      if (!url) return { status: 'UNAVAILABLE', value: null, dem: null };
      try {
        const result = await readTile(url, pixel, fetchImpl, bitmapImpl);
        if (result.kind === 'missing') continue;
        hadCoverage = true;
        if (result.kind === 'no-data') continue;
        return {
          status: hadRequestFailure ? 'PARTIAL' : 'READY',
          value: result.elevation,
          dem: { id: dem.id, source: dem.source, decimals: dem.decimals },
        };
      } catch {
        hadRequestFailure = true;
      }
    }
    return {
      status: hadRequestFailure ? 'UNAVAILABLE' : 'NO_DATA',
      value: null,
      dem: null,
      hadCoverage,
    };
  }

  globalThis.ElevationIdentify = Object.freeze({ identify });
  if (typeof module !== 'undefined' && module.exports) module.exports = { identify };
})(globalThis);
