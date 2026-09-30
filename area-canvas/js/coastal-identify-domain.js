((root) => {
  'use strict';
  // Verified individually against XKT027/A49 and XKT028/A40 on 2026-09-30.
  // Both API depth fields are CharacterString; neither uses Flood's integer rank table.
  const PROVIDERS = Object.freeze({
    'storm-surge': Object.freeze({ id: 'XKT027', title: '高潮浸水想定', prefix: 'A49', zooms: [13, 14, 15],
      sourceUrl: 'https://www.reinfolib.mlit.go.jp/help/apiManual/xkt027/',
      datasetUrl: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A49-2024.html',
      caution: '実際の高潮は想定を超える場合があります。浸水深区分は都道府県の原典図と異なる場合があります。' }),
    tsunami: Object.freeze({ id: 'XKT028', title: '津波浸水想定', prefix: 'A40', zooms: [14, 15],
      sourceUrl: 'https://www.reinfolib.mlit.go.jp/help/apiManual/xkt028/',
      datasetUrl: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A40-2024.html',
      caution: '実際の津波は想定を超える場合があります。浸水深区分は各都道府県の報告書等の資料です。' }),
  });
  function providerFor(kind) {
    if (!Object.hasOwn(PROVIDERS, kind)) throw new TypeError('Unknown coastal provider');
    return PROVIDERS[kind];
  }
  function tileFor(kind, point, zoom = 14) {
    if (!providerFor(kind).zooms.includes(zoom)) throw new TypeError('Unsupported zoom');
    // XYZ parent tile at z13 is exactly the integer parent of a validated z14 tile.
    const tile = FloodIdentifyDomain.tileFor(point, zoom === 13 ? 14 : zoom);
    return zoom === 13 ? { z: 13, x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2) } : tile;
  }
  function normalizeProperties(kind, p) {
    const prefix = providerFor(kind).prefix;
    const text = (v) => typeof v === 'string' && v.trim() ? v.trim() : null;
    const prefecture = text(p?.[`${prefix}_001`]);
    const prefectureCode = text(p?.[`${prefix}_002`]);
    const rawDepth = p?.[`${prefix}_003`];
    const depthText = text(rawDepth);
    // Preserve original wording; only require an explicit unit and range notation.
    // Numeric or unknown codes are never converted to a depth category.
    const syntax = depthText?.normalize('NFKC');
    const depth = syntax && /[0-9]/.test(syntax) && /m/i.test(syntax)
      && /(未満|以上|以下|超|[~〜～-])/.test(syntax) ? depthText : null;
    const targetYear = Number.isInteger(p?.target_year) && p.target_year >= 1900 && p.target_year <= 9999 ? p.target_year : null;
    const partial = !prefecture || !prefectureCode || !/^(0[1-9]|[1-3][0-9]|4[0-7])$/.test(prefectureCode) || !depth || !targetYear;
    return { prefecture, prefectureCode, depth, rawDepth: typeof rawDepth === 'string' || typeof rawDepth === 'number' ? rawDepth : null,
      targetYear, partial };
  }
  function identify(kind, collection, point) {
    tileFor(kind, point);
    if (Array.isArray(collection) && collection.length === 0) collection = { type: 'FeatureCollection', features: [] };
    if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features))
      return { status: 'UNAVAILABLE', hits: [], invalidCount: 0 };
    const hits = [];
    let invalidCount = 0;
    for (const feature of collection.features) {
      try {
        if (feature?.type !== 'Feature') throw new TypeError('Invalid Feature');
        const relation = FloodIdentifyDomain.geometryRelation(feature.geometry, point);
        if (relation !== 'OUTSIDE') hits.push({ ...normalizeProperties(kind, feature.properties), boundary: relation === 'BOUNDARY' });
      } catch { invalidCount += 1; }
    }
    const status = hits.length ? (invalidCount || hits.some((hit) => hit.partial || hit.boundary) ? 'PARTIAL' : 'READY')
      : invalidCount ? 'UNAVAILABLE' : 'NO_DATA';
    return { status, hits, invalidCount };
  }
  function toGroup(kind, result) {
    const provider = providerFor(kind);
    const overview = [];
    if (result.hits.length) {
      overview.push(`この地点で${result.hits.length}件の想定区域が確認されました。`);
      result.hits.forEach((hit, index) => overview.push(`想定区域 ${index + 1}`, `浸水深：${hit.depth || '未確認'}`));
    }
    if (result.status === 'NO_DATA') overview.push('今回照会した公式資料では、この地点に該当するPolygonは確認されませんでした。区域外であることは、浸水しないことを意味しません。');
    if (result.status === 'UNAVAILABLE') overview.push('公式Vector Evidenceを取得・検証できませんでした。NO_DATAや区域外とは判定していません。');
    if (result.status === 'PARTIAL') overview.push('一部の属性・境界・資料の完全性は未確認です。詳細と注意事項を確認してください。');
    const details = result.hits.flatMap((hit, index) => [
      `該当Feature ${index + 1} · 都道府県：${hit.prefecture || '未確認'}`,
      `対象年：${hit.targetYear ?? '未確認'}（API response target_year）`,
    ]);
    const evidence = [`Authority：EVIDENCE · ${provider.id} GeoJSON Vector（Rasterとは独立照会）`,
      'API一覧のデータ基準年度：2024年度（令和6年度、2026-09-30確認）。各Featureの対象年とは区別します。'];
    result.hits.forEach((hit, index) => {
      evidence.push(`該当Feature ${index + 1}`, `${provider.prefix}_001 都道府県名：${hit.prefecture || '未確認'}`,
        `${provider.prefix}_002 都道府県コード：${hit.prefectureCode || '未確認'}`,
        `${provider.prefix}_003 浸水深区分（原文）：${hit.rawDepth ?? '未確認'}`,
        `target_year 対象年：${hit.targetYear ?? '未確認'}`);
      if (!hit.depth) evidence.push('浸水深区分の形式は未確認です。未知コードを深さへ変換していません。');
      if (hit.boundary) evidence.push('Polygon境界上です。敷地の内外を確定せず原典で確認してください。');
    });
    if (result.invalidCount) evidence.push('不正Featureを含み、照会結果の完全性は確認できません。');
    evidence.push('分割Polygon・複数Featureを全件保持し、統合していません。', provider.caution,
      '原典と自治体資料を確認してください。安全・危険・購入推奨の判定は行いません。');
    const links = [
      { url: provider.sourceUrl, label: `国土交通省 不動産情報ライブラリ ${provider.id}` },
      { url: provider.datasetUrl, label: `国土数値情報 ${provider.title} 原典・利用条件` },
      { url: 'https://www.reinfolib.mlit.go.jp/help/apiManual/', label: 'API一覧・年度・No Data応答仕様' },
    ];
    return { title: provider.title, status: result.status, lines: [...overview, ...details, ...evidence],
      hazardDisplay: { overview, details, evidence, detailsTitle: '詳細' }, links };
  }
  const api = Object.freeze({ PROVIDERS, providerFor, tileFor, normalizeProperties, identify, toGroup });
  root.CoastalIdentifyDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
