(function initUrbanAreaClassificationDomain(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UrbanAreaClassificationDomain = api;
}(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const LAYER_TYPE = 'urban-area-classification';
  const SOURCE_DATASET = 'XKT001';
  const SOURCE_NAME = '国土交通省 不動産情報ライブラリ';
  const REFERENCE_YEAR = 2025;

  const CLASSIFICATIONS = Object.freeze({
    'urbanization-promotion-area': Object.freeze({
      label: '市街化区域',
      color: '#b8325a',
      fillColor: '#e85d83',
      fillOpacity: 0.24,
      weight: 1.4,
      dashArray: null,
    }),
    'urbanization-control-area': Object.freeze({
      label: '市街化調整区域',
      color: '#28714f',
      fillColor: '#58a879',
      fillOpacity: 0.23,
      weight: 1.5,
      dashArray: '6 4',
    }),
    'non-divided-city-planning-area': Object.freeze({
      label: '非線引き都市計画区域',
      color: '#8a671c',
      fillColor: '#d6a93c',
      fillOpacity: 0.24,
      weight: 1.4,
      dashArray: '2 4',
    }),
    'outside-city-planning-area': Object.freeze({
      label: '都市計画区域外',
      color: '#66645f',
      fillColor: '#a7a49c',
      fillOpacity: 0.18,
      weight: 1.2,
      dashArray: '1 5',
    }),
    unknown: Object.freeze({
      label: '未確認',
      color: '#77736c',
      fillColor: '#aaa69e',
      fillOpacity: 0.12,
      weight: 1,
      dashArray: '3 5',
    }),
  });

  function cleanText(value) {
    if (typeof value !== 'string') return undefined;
    const cleaned = value.trim();
    return cleaned || undefined;
  }

  function parseReferenceYear(value, fallback = REFERENCE_YEAR) {
    if (Number.isInteger(value) && value >= 1900 && value <= 2100) return value;
    const text = cleanText(value);
    if (!text) return fallback;
    const westernYear = text.match(/(?:19|20)\d{2}/);
    if (westernYear) return Number(westernYear[0]);
    const reiwaYear = text.match(/令和\s*(\d{1,2})/);
    if (reiwaYear) return 2018 + Number(reiwaYear[1]);
    return fallback;
  }

  function classificationCodeFrom(value) {
    const normalized = cleanText(value)?.replace(/\s+/g, '') || '';
    if (/市街化調整区域/.test(normalized)) return 'urbanization-control-area';
    if (/市街化区域/.test(normalized)) return 'urbanization-promotion-area';
    if (/(?:非|未)線引き(?:都市計画)?区域/.test(normalized)) {
      return 'non-divided-city-planning-area';
    }
    if (/都市計画区域外/.test(normalized)) return 'outside-city-planning-area';
    return 'unknown';
  }

  function firstText(source, fields) {
    for (const field of fields) {
      const value = cleanText(source?.[field]);
      if (value) return value;
    }
    return undefined;
  }

  function normalizeProperties(source = {}, options = {}) {
    const rawClassification = firstText(source, [
      'area_classification_ja',
      'areaClassificationJa',
      'classificationLabel',
      '区域区分',
    ]);
    const classificationCode = classificationCodeFrom(rawClassification);
    const classification = CLASSIFICATIONS[classificationCode];
    const properties = {
      schemaVersion: 1,
      layerType: LAYER_TYPE,
      classificationCode,
      classificationLabel: classification.label,
      referenceYear: parseReferenceYear(
        options.referenceYear ?? source.referenceYear ?? source.reference_year,
      ),
      sourceName: SOURCE_NAME,
      sourceDataset: SOURCE_DATASET,
    };

    const planningAreaName = firstText(source, [
      'planningAreaName',
      'planning_area_name',
      'urban_plan_area_name',
      'city_planning_area_name',
      '都市計画区域名',
    ]);
    const prefectureName = firstText(source, [
      'prefectureName',
      'prefecture',
      'prefecture_name',
      '都道府県名',
    ]);
    const municipalityName = firstText(source, [
      'municipalityName',
      'city_name',
      'municipality_name',
      '市区町村名',
    ]);
    if (planningAreaName) properties.planningAreaName = planningAreaName;
    if (prefectureName) properties.prefectureName = prefectureName;
    if (municipalityName) properties.municipalityName = municipalityName;
    return properties;
  }

  function normalizeFeature(feature, options = {}) {
    if (!feature || feature.type !== 'Feature') {
      throw new TypeError('XKT001 feature must be a GeoJSON Feature');
    }
    if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
      throw new TypeError('XKT001 feature geometry must be Polygon or MultiPolygon');
    }
    return {
      type: 'Feature',
      geometry: JSON.parse(JSON.stringify(feature.geometry)),
      properties: normalizeProperties(feature.properties, options),
    };
  }

  function styleFor(classificationCode) {
    const selected = CLASSIFICATIONS[classificationCode] || CLASSIFICATIONS.unknown;
    return {
      color: selected.color,
      fillColor: selected.fillColor,
      fillOpacity: selected.fillOpacity,
      weight: selected.weight,
      dashArray: selected.dashArray,
      opacity: 0.9,
    };
  }

  function formatReferenceYear(referenceYear) {
    if (!Number.isInteger(referenceYear)) return undefined;
    if (referenceYear >= 2019) return `令和${referenceYear - 2018}年度`;
    return `${referenceYear}年度`;
  }

  return Object.freeze({
    CLASSIFICATIONS,
    LAYER_TYPE,
    REFERENCE_YEAR,
    SOURCE_DATASET,
    SOURCE_NAME,
    classificationCodeFrom,
    formatReferenceYear,
    normalizeFeature,
    normalizeProperties,
    styleFor,
  });
}));
