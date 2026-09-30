((root) => {
  'use strict';
  const SOURCE_URL = 'https://www.reinfolib.mlit.go.jp/help/apiManual/xkt029/';
  const DATASET_URL = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33-2024.html';
  // Official A33 code lists, verified 2026-09-30. Integer API fields only.
  const PHENOMENA = Object.freeze({ 1: '急傾斜地の崩壊', 2: '土石流', 3: '地滑り' });
  const ZONES = Object.freeze({ 1: '土砂災害警戒区域（指定済）', 2: '土砂災害特別警戒区域（指定済）',
    3: '土砂災害警戒区域（指定前・基礎調査結果の公表）', 4: '土砂災害特別警戒区域（指定前・基礎調査結果の公表）' });
  const FLAGS = Object.freeze({ 0: '特別警戒区域指定済み', 1: '特別警戒区域未指定' });
  const FIELDS = Object.freeze(['A33_001','A33_002','A33_003','A33_004','A33_005','A33_006','A33_007','A33_008']);
  function tileFor(point, zoom = 14) {
    if (!Number.isInteger(zoom) || zoom < 11 || zoom > 15) throw new TypeError('Unsupported zoom');
    const tile = FloodIdentifyDomain.tileFor(point, zoom < 14 ? 14 : zoom);
    const divisor = 2 ** (14 - zoom);
    return zoom < 14 ? { z: zoom, x: Math.floor(tile.x / divisor), y: Math.floor(tile.y / divisor) } : tile;
  }
  function normalizeProperties(p) {
    const raw = Object.fromEntries(FIELDS.map((key) => [key,
      ['string','number'].includes(typeof p?.[key]) ? p[key] : null]));
    const code = (key, list) => Number.isInteger(raw[key]) && Object.hasOwn(list, raw[key]) ? list[raw[key]] : null;
    const text = (key) => typeof raw[key] === 'string' && raw[key].trim() ? raw[key].trim() : null;
    const item = { phenomenon: code('A33_001', PHENOMENA), zone: code('A33_002', ZONES),
      prefectureCode: text('A33_003'), areaNumber: text('A33_004'), areaName: text('A33_005'),
      location: text('A33_006'), noticeDate: text('A33_007'), unspecified: code('A33_008', FLAGS), raw };
    item.partial = ['phenomenon','zone','prefectureCode','areaNumber','areaName','location','noticeDate','unspecified']
      .some((key) => !item[key]) || !/^(0[1-9]|[1-3][0-9]|4[0-7])$/.test(item.prefectureCode || '');
    return item;
  }
  function identify(collection, point) {
    tileFor(point);
    if (Array.isArray(collection) && collection.length === 0) collection = { type: 'FeatureCollection', features: [] };
    if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features))
      return { status: 'UNAVAILABLE', hits: [], invalidCount: 0, lineCount: 0 };
    const hits = [];
    let invalidCount = 0, lineCount = 0;
    for (const feature of collection.features) {
      try {
        if (feature?.type !== 'Feature') throw new TypeError('Invalid Feature');
        // XKT029 explicitly contains lines in some regions. Never buffer them into areas.
        if (['LineString','MultiLineString'].includes(feature.geometry?.type)) {
          lineCount += 1; invalidCount += 1; continue;
        }
        const relation = FloodIdentifyDomain.geometryRelation(feature.geometry, point);
        if (relation !== 'OUTSIDE') hits.push({ ...normalizeProperties(feature.properties), boundary: relation === 'BOUNDARY' });
      } catch { invalidCount += 1; }
    }
    const status = hits.length ? (invalidCount || hits.some((hit) => hit.partial || hit.boundary) ? 'PARTIAL' : 'READY')
      : invalidCount ? 'UNAVAILABLE' : 'NO_DATA';
    return { status, hits, invalidCount, lineCount };
  }
  function toGroup(result) {
    const overview = [];
    if (result.hits.length) {
      overview.push(`この地点で${result.hits.length}件の区域が確認されました。`);
      result.hits.forEach((hit, index) => overview.push(`区域 ${index + 1}`, hit.phenomenon || '現象の種類：未確認', hit.zone || '区域区分：未確認'));
    }
    if (result.status === 'NO_DATA') overview.push('今回照会した公式資料では、この地点に該当する区域は確認されませんでした。区域外であることは、斜面災害等の危険がないことを意味しません。');
    if (result.status === 'UNAVAILABLE') overview.push('公式Vector Evidenceを取得・検証できませんでした。NO_DATAや区域外とは判定していません。');
    if (result.status === 'PARTIAL') overview.push('一部の属性・境界・資料の完全性は未確認です。詳細と注意事項を確認してください。');
    const details = result.hits.flatMap((hit, index) => [
      `該当Feature ${index + 1} · 区域名：${hit.areaName || '未確認'}`,
      `所在地：${hit.location || '未確認'} / 都道府県コード：${hit.prefectureCode || '未確認'}`,
      `公示日（API表記）：${hit.noticeDate || '未確認'}`, `特別警戒未指定フラグ：${hit.unspecified || '未確認'}`,
    ]);
    const labels = ['現象の種類','区域区分','都道府県コード','区域番号','区域名','所在地','公示日','特別警戒未指定フラグ'];
    const evidence = ['Authority：EVIDENCE · XKT029 GeoJSON Vector（Rasterとは独立照会）',
      'データ基準年度：2024年度（API一覧、2026-09-30確認）。原典基準日は2024-06-30。',
      'XKT029公式出力仕様にtarget_yearはありません。公示日・データ基準年度を対象年に置き換えていません。'];
    result.hits.forEach((hit, index) => {
      evidence.push(`該当Feature ${index + 1}`, ...FIELDS.map((key,i) => `${key} ${labels[i]}（原値）：${hit.raw[key] ?? '未確認'}`));
      if (hit.partial) evidence.push('未知コード・欠測属性は未確認です。推測で変換していません。');
      if (hit.boundary) evidence.push('Polygon境界上です。敷地の内外を確定せず原典で確認してください。');
    });
    if (result.lineCount) evidence.push(`照会tileにLine形式のFeatureが${result.lineCount}件あります。面の地点該当を判定できず、Polygonへ補完していません。`);
    if (result.invalidCount > (result.lineCount || 0)) evidence.push('検証できないFeatureを含み、照会結果の完全性は確認できません。');
    evidence.push('複数Featureは全件を個別保持し、統合していません。',
      '国土数値情報は概略位置を示す参考資料で、法的図書ではありません。全区域を網羅せず、指定・解除も直ちに反映されません。',
      '正確な区域は指定した都道府県等の原典・公示図書で確認してください。都道府県ごとの利用条件・データ時点も確認してください。',
      '安全・危険・リスクスコア・購入推奨の自動評価は行いません。');
    const links = [
      { url: SOURCE_URL, label: '不動産情報ライブラリ XKT029 公式仕様' },
      { url: DATASET_URL, label: '国土数値情報 A33 2024 原典・注意事項・利用条件' },
      { url: 'https://www.reinfolib.mlit.go.jp/help/apiManual/', label: 'API一覧・年度・No Data応答' },
      { url: 'https://nlftp.mlit.go.jp/ksj/gml/codelist/CodeOfPhenomenon.html', label: '公式 現象種別コード' },
      { url: 'https://nlftp.mlit.go.jp/ksj/gml/codelist/CodeOfZone_A33.html', label: '公式 区域コード（指定前を含む）' },
      { url: 'https://nlftp.mlit.go.jp/ksj/gml/codelist/CodeOfUnSpecification.html', label: '公式 特別警戒区域未指定コード' },
      { url: 'https://nlftp.mlit.go.jp/ksj/gml/codelist/PrefCd.html', label: '公式 都道府県コード' },
    ];
    return { title: '土砂災害', status: result.status, lines: [...overview,...details,...evidence],
      hazardDisplay: { overview, details, evidence, detailsTitle: '詳細' }, links };
  }
  const api = Object.freeze({ SOURCE_URL, DATASET_URL, PHENOMENA, ZONES, FLAGS, FIELDS, tileFor, normalizeProperties, identify, toGroup });
  root.LandslideIdentifyDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
