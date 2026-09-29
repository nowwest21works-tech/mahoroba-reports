((globalThis) => {
  const SOURCE_URL = 'https://www.gsi.go.jp/bousaichiri/lfc_index.html';

  async function identify(map, latlng, fetchImpl = globalThis.fetch) {
    const zoom = Math.max(14, Math.min(16, Math.floor(map?.getZoom?.() ?? 14)));
    const urls = TerrainIdentifyDomain.tileUrl(map, latlng, zoom);
    if (!urls || typeof fetchImpl !== 'function') {
      return { status: 'UNAVAILABLE', classification: null, sourceUrl: SOURCE_URL };
    }

    const results = await Promise.all(urls.map(async (url) => {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error('request failed');
        const body = await response.json();
        if (!body || body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
          throw new Error('invalid GeoJSON');
        }
        return { ok: true, feature: TerrainIdentifyDomain.findFeatureAtPoint(body, latlng) };
      } catch {
        return { ok: false, feature: null };
      }
    }));

    const feature = results.find((result) => result.feature)?.feature;
    if (feature) {
      const classification = TerrainIdentifyDomain.classifyCode(feature.properties?.code);
      if (!classification) return { status: 'UNAVAILABLE', classification: null, sourceUrl: SOURCE_URL };
      return {
        status: results.every((result) => result.ok) ? 'READY' : 'PARTIAL',
        classification,
        sourceUrl: SOURCE_URL,
      };
    }
    if (results.some((result) => !result.ok)) {
      return { status: results.some((result) => result.ok) ? 'PARTIAL' : 'UNAVAILABLE', classification: null, sourceUrl: SOURCE_URL };
    }
    return { status: 'NO_FEATURE', classification: null, sourceUrl: SOURCE_URL };
  }

  globalThis.TerrainIdentify = Object.freeze({ identify });
  if (typeof module !== 'undefined' && module.exports) module.exports = { identify };
})(globalThis);
