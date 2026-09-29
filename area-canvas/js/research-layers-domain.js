((globalThis) => {
  const REQUIRED_IDS = [
    'landform-classification',
    'meiji-lowland',
    'seamless-geology',
  ];
  const TILE_URLS = {
    'landform-classification': 'https://cyberjapandata.gsi.go.jp/xyz/lcmfc2/{z}/{x}/{y}.png',
    'meiji-lowland': 'https://cyberjapandata.gsi.go.jp/xyz/swale/{z}/{x}/{y}.png',
    'seamless-geology': 'https://gbank.gsj.jp/seamless/v2/api/1.3.1/tiles/{z}/{y}/{x}.png?layer=g',
  };
  const SOURCE_HOSTS = {
    'landform-classification': 'www.gsi.go.jp',
    'meiji-lowland': 'svd1-web1.gsi.go.jp',
    'seamless-geology': 'gbank.gsj.jp',
  };
  const TERMS_HOSTS = {
    'landform-classification': 'web1.gsi.go.jp',
    'meiji-lowland': 'web1.gsi.go.jp',
    'seamless-geology': 'gbank.gsj.jp',
  };

  function fail(message) {
    throw new TypeError(message);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function validateLayer(layer) {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) fail('Layer must be an object');
    if (!REQUIRED_IDS.includes(layer.id)) fail('Unknown research layer');
    if (!isNonEmptyString(layer.title) || layer.group !== 'terrain') fail('Invalid layer title or group');
    if (layer.authority !== 'EVIDENCE') fail('Invalid authority');
    if (!isNonEmptyString(layer.sourceOrg) || !isNonEmptyString(layer.sourceTitle)) fail('Missing source identity');
    let source;
    try { source = new URL(layer.sourceUrl); } catch { fail('Invalid source URL'); }
    if (source.protocol !== 'https:' || source.hostname !== SOURCE_HOSTS[layer.id]) fail('Untrusted source URL');
    let terms;
    try { terms = new URL(layer.termsUrl); } catch { fail('Invalid terms URL'); }
    if (terms.protocol !== 'https:' || terms.hostname !== TERMS_HOSTS[layer.id]) fail('Untrusted terms URL');
    if (layer.tileUrl !== TILE_URLS[layer.id]) fail('Invalid tile endpoint');
    if (!Number.isInteger(layer.minZoom) || !Number.isInteger(layer.maxZoom)
      || layer.minZoom < 0 || layer.maxZoom > 22 || layer.minZoom > layer.maxZoom) fail('Invalid zoom range');
    if (!isNonEmptyString(layer.attribution) || /[<>]/.test(layer.attribution)) fail('Invalid attribution');
    if (layer.status !== 'approved-for-pilot' || layer.publicAllowed !== true) fail('Layer is not approved for pilot display');
    if (!isNonEmptyString(layer.caution)) fail('Missing caution');
    if (typeof layer.opacityDefault !== 'number' || !Number.isFinite(layer.opacityDefault)
      || layer.opacityDefault < 0.1 || layer.opacityDefault > 1) fail('Invalid opacity');
    return Object.freeze({ ...layer });
  }

  function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
      || manifest.schemaVersion !== 1 || !Array.isArray(manifest.layers)
      || manifest.layers.length !== REQUIRED_IDS.length) fail('Invalid research layer manifest');
    const layers = manifest.layers.map(validateLayer);
    const ids = layers.map((layer) => layer.id);
    if (new Set(ids).size !== REQUIRED_IDS.length
      || REQUIRED_IDS.some((id) => !ids.includes(id))) fail('Research layer manifest is incomplete');
    if (!layers.every((layer) => layer.opacityDefault === layers[0].opacityDefault)) {
      fail('Shared opacity control requires one common default');
    }
    return Object.freeze(layers);
  }

  function findLayer(layers, id) {
    if (!Array.isArray(layers) || !REQUIRED_IDS.includes(id)) return null;
    const candidate = layers.find((layer) => layer && layer.id === id);
    try { return candidate ? validateLayer(candidate) : null; } catch { return null; }
  }

  function supportsZoom(layer, zoom) {
    return Boolean(layer && Number.isFinite(zoom)
      && Number.isInteger(layer.minZoom) && Number.isInteger(layer.maxZoom)
      && zoom >= layer.minZoom && zoom <= layer.maxZoom);
  }

  function canDisplayAtZoom(layer, zoom, mapMaxZoom) {
    if (!layer || !Number.isFinite(zoom) || !Number.isInteger(layer.minZoom)
      || !Number.isInteger(layer.maxZoom) || zoom < layer.minZoom) return false;
    const displayMax = layer.id === 'seamless-geology'
      ? (Number.isFinite(mapMaxZoom) ? mapMaxZoom : layer.maxZoom)
      : layer.maxZoom;
    return zoom <= displayMax;
  }

  function summarizeTileHealth({ loaded = 0, failed = 0, pending = 0 } = {}) {
    if (![loaded, failed, pending].every((value) => Number.isInteger(value) && value >= 0)) return 'UNAVAILABLE';
    if (pending > 0) return 'LOADING';
    if (loaded > 0 && failed > 0) return 'PARTIAL';
    if (loaded > 0) return 'READY';
    if (failed > 0) return 'UNAVAILABLE';
    return 'LOADING';
  }

  const api = Object.freeze({ canDisplayAtZoom, findLayer, summarizeTileHealth, supportsZoom, validateLayer, validateManifest });
  globalThis.ResearchLayersDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
