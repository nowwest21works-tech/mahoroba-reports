(function initUrbanAreaClassificationLayer(root) {
  'use strict';

  const domain = root.UrbanAreaClassificationDomain;
  const scriptUrl = document.currentScript?.src
    || new URL('./js/urban-area-classification-layer.js', document.baseURI).href;
  const DATA_URL = new URL(
    '../data/urban-area-classification/aichi.geojson',
    scriptUrl,
  ).href;
  const PANE_NAME = 'urban-area-classification';
  const toggle = document.getElementById('urban-area-classification-toggle');
  const state = document.getElementById('urban-area-classification-state');
  const legend = document.getElementById('urban-area-classification-legend');
  let layer = null;
  let loadPromise = null;

  function setState(message, kind = 'idle') {
    state.textContent = message;
    state.dataset.kind = kind;
  }

  function appendPopupRow(container, label, value) {
    if (value === undefined || value === null || value === '') return;
    const row = document.createElement('div');
    row.className = 'urban-area-popup-row';
    const term = document.createElement('div');
    term.className = 'urban-area-popup-label';
    term.textContent = label;
    const detail = document.createElement('div');
    detail.className = 'urban-area-popup-value';
    detail.textContent = String(value);
    row.append(term, detail);
    container.append(row);
  }

  function buildPopup(properties) {
    const container = document.createElement('div');
    container.className = 'urban-area-popup';
    const title = document.createElement('div');
    title.className = 'urban-area-popup-title';
    title.textContent = '区域区分';
    const classification = document.createElement('div');
    classification.className = 'urban-area-popup-classification';
    classification.textContent = properties.classificationLabel || '未確認';
    container.append(title, classification);
    appendPopupRow(container, '都市計画区域', properties.planningAreaName);
    appendPopupRow(
      container,
      '市区町村',
      [properties.prefectureName, properties.municipalityName].filter(Boolean).join(''),
    );
    appendPopupRow(
      container,
      'データ基準年度',
      domain.formatReferenceYear(properties.referenceYear),
    );
    appendPopupRow(container, '出典', properties.sourceName);
    const caution = document.createElement('p');
    caution.className = 'urban-area-popup-caution';
    caution.textContent = '参考情報です。正式な区域は各自治体の担当窓口で確認してください。';
    container.append(caution);
    return container;
  }

  function onEachFeature(feature, featureLayer) {
    featureLayer.options.pmIgnore = true;
    featureLayer.bindPopup(buildPopup(feature.properties), {
      maxWidth: 300,
      className: 'urban-area-popup-shell',
    });
    featureLayer.on('click', (event) => {
      L.DomEvent.stopPropagation(event.originalEvent);
    });
  }

  function validateCollection(collection) {
    if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
      throw new TypeError('区域区分データがGeoJSON FeatureCollectionではありません');
    }
    for (const feature of collection.features) {
      if (
        feature?.properties?.schemaVersion !== 1
        || feature.properties.layerType !== domain.LAYER_TYPE
        || !domain.CLASSIFICATIONS[feature.properties.classificationCode]
        || !['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type)
      ) {
        throw new TypeError('区域区分データの正規化形式が不正です');
      }
    }
    return collection;
  }

  async function loadLayer() {
    if (layer) return layer;
    if (!loadPromise) {
      loadPromise = fetch(DATA_URL, { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) throw new Error(`区域区分データを取得できませんでした (${response.status})`);
          return response.json();
        })
        .then(validateCollection)
        .then((collection) => {
          layer = L.geoJSON(collection, {
            pane: PANE_NAME,
            interactive: true,
            bubblingMouseEvents: false,
            pmIgnore: true,
            filter: (feature) => domain.isDisplayClassification(
              feature.properties.classificationCode,
            ),
            style: (feature) => domain.styleFor(feature.properties.classificationCode),
            onEachFeature,
          });
          return layer;
        })
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  }

  async function setEnabled(enabled) {
    toggle.disabled = true;
    if (!enabled) {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      legend.hidden = true;
      setState('市街化区域・市街化調整区域：OFF');
      toggle.disabled = false;
      return;
    }

    setState('区域区分データを読み込み中…', 'loading');
    try {
      const loadedLayer = await loadLayer();
      if (!toggle.checked) return;
      loadedLayer.addTo(map);
      loadedLayer.bringToBack();
      legend.hidden = false;
      setState(
        `市街化区域・市街化調整区域：ON（${loadedLayer.getLayers().length}区画）`,
        'success',
      );
      showStatus('市街化区域・市街化調整区域：ON');
    } catch (error) {
      toggle.checked = false;
      legend.hidden = true;
      setState(
        `${error.message}。データ生成手順はREADMEを確認してください。`,
        'error',
      );
      showStatus('区域区分データを読み込めませんでした', 3500);
    } finally {
      toggle.disabled = false;
    }
  }

  map.createPane(PANE_NAME);
  map.getPane(PANE_NAME).style.zIndex = '350';

  toggle.addEventListener('change', () => {
    setEnabled(toggle.checked);
  });

  root.UrbanAreaClassificationLayer = Object.freeze({
    DATA_URL,
    getLayer: () => layer,
    setEnabled,
  });
}(globalThis));
