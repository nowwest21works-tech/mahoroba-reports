// ========== 地理データレイヤー（MapLayerToggle） ==========
// 行政界・鉄道・道路・河川。データ未生成／不正／取得不能の場合は安全にOFFのまま留まり、
// 形状を推測・生成AIで捏造して表示することはしない（受入条件）。
(() => {
  const internalDataEnabled = new URLSearchParams(window.location.search).get('internalData') === '1';
  const LAYER_DEFS = {
    'administrative-boundary': {
      url: './data/administrative-boundary/aichi.geojson',
      label: '市区町村・区の境界',
      allowedGeometries: ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'],
      pane: 'base-administrative-boundary',
      zIndex: 320,
      style: () => ({ color: '#6f6f6a', weight: 1.2, opacity: 0.8, fill: false }),
    },
    railway: {
      url: './data/railway/aichi.geojson',
      label: '鉄道路線・主要駅',
      allowedGeometries: ['LineString', 'MultiLineString', 'Point', 'MultiPoint'],
      pane: 'base-railway',
      zIndex: 330,
      style: () => ({ color: '#2c3e50', weight: 2, opacity: 0.85 }),
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 3,
        color: '#2c3e50',
        weight: 1,
        fillColor: '#ffffff',
        fillOpacity: 1,
      }),
    },
    road: {
      url: './data/road/aichi.geojson',
      label: '国道・主要県道',
      allowedGeometries: ['LineString', 'MultiLineString'],
      pane: 'base-road',
      zIndex: 325,
      style: () => ({ color: '#c8443a', weight: 2, opacity: 0.75 }),
    },
    river: {
      url: './data/river/aichi.geojson',
      label: '河川・水域',
      allowedGeometries: ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'],
      pane: 'base-river',
      zIndex: 315,
      internalOnly: true,
      missingMessage: '公開版ではデータ未提供（Internal / Local QA専用）',
      style: () => ({ color: '#4a90d9', weight: 1.5, opacity: 0.7 }),
    },
  };

  const layerState = {};

  function validateCollection(collection, def) {
    if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new TypeError('GeoJSON FeatureCollection形式ではありません');
    }
    for (const feature of collection.features) {
      const geometryType = feature?.geometry?.type;
      if (!def.allowedGeometries.includes(geometryType)) {
        throw new TypeError(`想定外のgeometry種別です: ${geometryType}`);
      }
    }
    return collection;
  }

  function stateElFor(key) {
    return document.querySelector(`[data-base-layer-state="${key}"]`);
  }

  function setState(key, message, kind = 'idle') {
    const el = stateElFor(key);
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind;
  }

  async function loadLayer(key) {
    const def = LAYER_DEFS[key];
    const entry = layerState[key];
    if (entry.layer) return entry.layer;
    if (!entry.loadPromise) {
      entry.loadPromise = fetch(def.url, { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) {
            if (response.status === 404 && def.missingMessage) {
              throw new Error(def.missingMessage);
            }
            throw new Error(`データを取得できませんでした (${response.status})`);
          }
          return response.json();
        })
        .then((collection) => validateCollection(collection, def))
        .then((collection) => {
          if (collection.features.length === 0) {
            throw new Error('データ未生成（0件）');
          }
          const layer = L.geoJSON(collection, {
            pane: def.pane,
            interactive: false,
            pmIgnore: true,
            style: def.style,
            pointToLayer: def.pointToLayer,
          });
          entry.layer = layer;
          return layer;
        })
        .catch((error) => {
          entry.loadPromise = null;
          throw error;
        });
    }
    return entry.loadPromise;
  }

  async function setEnabled(key, enabled) {
    const def = LAYER_DEFS[key];
    const checkbox = document.querySelector(`[data-base-layer="${key}"]`);
    if (checkbox) checkbox.disabled = true;

    if (!enabled) {
      const entry = layerState[key];
      if (entry.layer && map.hasLayer(entry.layer)) map.removeLayer(entry.layer);
      setState(key, `${def.label}：OFF`);
      if (checkbox) checkbox.disabled = false;
      return;
    }

    setState(key, `${def.label}を読み込み中…`, 'loading');
    try {
      const layer = await loadLayer(key);
      if (checkbox && !checkbox.checked) return;
      layer.addTo(map);
      setState(key, `${def.label}：ON（${layer.getLayers().length}件）`, 'success');
      showStatus(`${def.label}：ON`);
    } catch (error) {
      if (checkbox) checkbox.checked = false;
      setState(
        key,
        `${def.label}：${error.message}。data/README.mdの生成手順を確認してください。`,
        'error',
      );
      showStatus(`${def.label}を読み込めませんでした`, 3500);
    } finally {
      if (checkbox) checkbox.disabled = false;
    }
  }

  Object.keys(LAYER_DEFS).forEach((key) => {
    const def = LAYER_DEFS[key];
    map.createPane(def.pane);
    map.getPane(def.pane).style.zIndex = String(def.zIndex);
    layerState[key] = { layer: null, loadPromise: null };
    const checkbox = document.querySelector(`[data-base-layer="${key}"]`);
    if (checkbox) {
      if (def.internalOnly && !internalDataEnabled) {
        checkbox.checked = false;
        checkbox.disabled = true;
        checkbox.title = def.missingMessage;
        setState(key, `${def.label}：${def.missingMessage}`, 'idle');
        return;
      }
      checkbox.addEventListener('change', () => setEnabled(key, checkbox.checked));
    }
  });
})();
