(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeepTimeDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ERAS = Object.freeze(['present', 'jomon', 'lgm']);
  const AUTHORITIES = Object.freeze(['EVIDENCE', 'RECONSTRUCTION', 'ILLUSTRATION']);
  const GEOMETRIES = Object.freeze([
    'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
  ]);
  const OVERLAYS = Object.freeze([
    { id: 'buried-valley', title: '古木曽川埋没谷' },
    { id: 'alluvial-base', title: '沖積層基底・深度' },
    { id: 'landform', title: '地形分類' },
    { id: 'geology', title: '地質' },
    { id: 'active-faults', title: '活断層・活構造' },
  ]);
  const DATASET_IDS = Object.freeze(['jomon', 'lgm', ...OVERLAYS.map((item) => item.id)]);

  function defaultState() {
    return { enabled: false, era: 'present', overlays: [], opacity: 60 };
  }

  function normalizeState(value) {
    const input = value && typeof value === 'object' ? value : {};
    const opacityInput = typeof input.opacity === 'number'
      || (typeof input.opacity === 'string' && input.opacity.trim() !== '')
      ? Number(input.opacity) : NaN;
    return {
      enabled: input.enabled === true,
      era: ERAS.includes(input.era) ? input.era : 'present',
      overlays: Array.isArray(input.overlays)
        ? [...new Set(input.overlays.filter((id) => OVERLAYS.some((item) => item.id === id)))]
        : [],
      opacity: Number.isFinite(opacityInput)
        ? Math.max(10, Math.min(100, Math.round(opacityInput)))
        : 60,
    };
  }

  function validateManifest(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.datasets)) {
      throw new TypeError('Deep Time manifest形式が不正です');
    }
    const seen = new Set();
    for (const item of value.datasets) {
      if (!item || !DATASET_IDS.includes(item.id) || seen.has(item.id)
        || typeof item.title !== 'string' || !item.title.trim()
        || !['unconnected', 'connected'].includes(item.status)
        || !Object.prototype.hasOwnProperty.call(item, 'period')
        || (item.period !== null && typeof item.period !== 'string')
        || !Object.prototype.hasOwnProperty.call(item, 'sourceOrg')
        || (item.sourceOrg !== null && typeof item.sourceOrg !== 'string')
        || !Object.prototype.hasOwnProperty.call(item, 'sourceTitle')
        || (item.sourceTitle !== null && typeof item.sourceTitle !== 'string')
        || !Object.prototype.hasOwnProperty.call(item, 'authority')
        || (item.authority !== null && !AUTHORITIES.includes(item.authority))
        || !Object.prototype.hasOwnProperty.call(item, 'license')
        || (item.license !== null && typeof item.license !== 'string')
        || !Object.prototype.hasOwnProperty.call(item, 'publicAllowed')
        || (item.publicAllowed !== null && typeof item.publicAllowed !== 'boolean')) {
        throw new TypeError('Deep Time dataset定義が不正です');
      }
      if (item.status === 'connected' && (!isRenderableDataset(item)
        || (item.period !== null && !hasVerifiedText(item.period)))) {
        throw new TypeError('公開条件が未確認のDeep Time datasetです');
      }
      seen.add(item.id);
    }
    if (seen.size !== DATASET_IDS.length) throw new TypeError('Deep Time dataset定義が不足しています');
    return value;
  }

  function available(manifest, id) {
    try {
      validateManifest(manifest);
    } catch (_) {
      return false;
    }
    return isRenderableDataset(manifest.datasets.find((dataset) => dataset.id === id));
  }

  function hasVerifiedText(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    return !['unknown', 'tbd', 'null', '未確認', '不明', '準備中']
      .includes(value.trim().toLowerCase());
  }

  function isRenderableDataset(item) {
    return Boolean(item && item.status === 'connected' && hasVerifiedText(item.title)
      && item.publicAllowed === true
      && hasVerifiedText(item.license) && AUTHORITIES.includes(item.authority)
      && hasVerifiedText(item.sourceOrg) && hasVerifiedText(item.sourceTitle)
      && GEOMETRIES.includes(item.geometry) && isSafeDataUrl(item.url));
  }

  function isSafeDataUrl(value) {
    if (typeof value !== 'string' || !value.startsWith('./data/deep-time/')) return false;
    return !value.split('/').includes('..') && !/%2e|%5c|[?#\\]/i.test(value);
  }

  function validateGeoJson(collection, dataset) {
    if (!isRenderableDataset(dataset)
      || !collection || collection.type !== 'FeatureCollection'
      || !Array.isArray(collection.features) || collection.features.length === 0) {
      throw new TypeError('Deep Time GeoJSONまたはdataset定義が不正です');
    }
    const isValidPositionTree = (value) => {
      if (!Array.isArray(value) || value.length === 0) return false;
      if (typeof value[0] === 'number') {
        return value.length >= 2 && value[0] >= -180 && value[0] <= 180
          && value[1] >= -90 && value[1] <= 90
          && value.every((coordinate) => typeof coordinate === 'number'
            && Number.isFinite(coordinate));
      }
      return value.every(isValidPositionTree);
    };
    for (const feature of collection.features) {
      const geometry = feature?.type === 'Feature' ? feature.geometry : null;
      if (!geometry || geometry.type !== dataset.geometry
        || !isValidPositionTree(geometry.coordinates)) {
        throw new TypeError('Deep Time geometryが欠損または定義と一致しません');
      }
    }
    return collection;
  }

  function effectiveSelection(state, manifest) {
    const next = normalizeState(state);
    if (!next.enabled) return { era: 'present', overlays: [] };
    return {
      era: next.era !== 'present' && available(manifest, next.era) ? next.era : 'present',
      overlays: next.overlays.filter((id) => available(manifest, id)),
    };
  }

  return { ERAS, AUTHORITIES, GEOMETRIES, OVERLAYS, DATASET_IDS, defaultState, normalizeState,
    validateManifest, available, effectiveSelection, validateGeoJson };
});
