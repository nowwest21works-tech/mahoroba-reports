((root) => {
  'use strict';
  const SOURCE_URL = 'https://www.reinfolib.mlit.go.jp/help/apiManual/xkt026/';
  // Official water_depth_code.xlsx, verified 2026-09-30. No risk interpretation.
  const DEPTHS = Object.freeze({ 1: '0～0.5m未満', 2: '0.5～3.0m未満',
    3: '3.0～5.0m未満', 4: '5.0～10.0m未満', 5: '10.0～20.0m未満', 6: '20.0m以上' });
  const REFERENCE = Object.freeze({ year: 2024,
    basis: '不動産情報ライブラリ公開API一覧の令和6年度表記（2026-09-30確認）。個別河川の指定年度はAPI属性にありません。',
    url: 'https://www.reinfolib.mlit.go.jp/help/apiManual/' });
  function tileFor(point, z = 14) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)
      || Math.abs(point.lat) > 85.0511287798066 || point.lng < -180 || point.lng >= 180
      || ![14, 15].includes(z)) throw new TypeError('Invalid point or zoom');
    const n = 2 ** z, rad = point.lat * Math.PI / 180;
    const x = Math.floor((point.lng + 180) / 360 * n);
    const y = Math.min(n - 1, Math.max(0, Math.floor((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * n)));
    return { z, x, y };
  }
  function validPosition(p) {
    return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
      && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  }
  function validPolygon(rings) {
    return Array.isArray(rings) && rings.length > 0 && rings.every((ring) => {
      if (!Array.isArray(ring) || ring.length < 4 || !ring.every(validPosition)) return false;
      const first = ring[0], last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) return false;
      let area = 0;
      for (let i = 1; i < ring.length; i += 1) area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
      return Math.abs(area) > 1e-12;
    });
  }
  function validGeometry(g) {
    if (g?.type === 'Polygon') return validPolygon(g.coordinates);
    return g?.type === 'MultiPolygon' && Array.isArray(g.coordinates)
      && g.coordinates.length > 0 && g.coordinates.every(validPolygon);
  }
  function ringRelation(ring, point) {
    const x = point.lng, y = point.lat;
    let inside = false;
    for (let i = 1; i < ring.length; i += 1) {
      const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
      const dx = bx - ax, dy = by - ay;
      const cross = (x - ax) * dy - (y - ay) * dx;
      if (Math.abs(cross) <= 1e-10 * Math.max(Math.abs(dx), Math.abs(dy))
        && x >= Math.min(ax, bx) - 1e-10 && x <= Math.max(ax, bx) + 1e-10
        && y >= Math.min(ay, by) - 1e-10 && y <= Math.max(ay, by) + 1e-10) return 'BOUNDARY';
      if ((ay > y) !== (by > y) && x < dx * (y - ay) / dy + ax) inside = !inside;
    }
    return inside ? 'INSIDE' : 'OUTSIDE';
  }
  function polygonRelation(rings, point) {
    const outer = ringRelation(rings[0], point);
    if (outer === 'OUTSIDE') return outer;
    for (const hole of rings.slice(1)) {
      const relation = ringRelation(hole, point);
      if (relation === 'INSIDE') return 'OUTSIDE';
      if (relation === 'BOUNDARY') return relation;
    }
    return outer;
  }
  function geometryRelation(g, point) {
    if (!validGeometry(g)) throw new TypeError('Invalid polygon');
    const results = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
      .map((rings) => polygonRelation(rings, point));
    return results.includes('BOUNDARY') ? 'BOUNDARY' : results.includes('INSIDE') ? 'INSIDE' : 'OUTSIDE';
  }
  function normalizeProperties(p) {
    const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
    const rank = Number.isInteger(p?.A31a_205) ? p.A31a_205 : null;
    const item = { riverNumber: text(p?.A31a_201), riverName: text(p?.A31a_202),
      managerNumber: text(p?.A31a_203), manager: text(p?.A31a_204), depthRank: rank,
      depth: DEPTHS[rank] || null };
    item.partial = Object.values(item).some((value) => value === null);
    return item;
  }
  function identify(collection, point) {
    tileFor(point);
    // Official API Q&A documents an empty array for tiles without data.
    if (Array.isArray(collection) && collection.length === 0) collection = { type: 'FeatureCollection', features: [] };
    if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features))
      return { status: 'UNAVAILABLE', hits: [], invalidCount: 0 };
    const hits = [];
    let invalidCount = 0;
    for (const feature of collection.features) {
      if (feature?.type !== 'Feature' || !validGeometry(feature.geometry)) { invalidCount += 1; continue; }
      const relation = geometryRelation(feature.geometry, point);
      if (relation === 'OUTSIDE') continue;
      hits.push({ ...normalizeProperties(feature.properties), boundary: relation === 'BOUNDARY' });
    }
    const status = hits.length ? (invalidCount || hits.some((hit) => hit.partial || hit.boundary) ? 'PARTIAL' : 'READY')
      : invalidCount ? 'UNAVAILABLE' : 'NO_DATA';
    return { status, hits, invalidCount };
  }
  function toGroup(result) {
    const lines = ['Authority：EVIDENCE · XKT026 Vector（Raster表示とは別照会）'];
    result.hits.forEach((hit, index) => {
      lines.push(`該当Feature ${index + 1} · 河川：${hit.riverName || '未確認'}`,
        `河川番号：${hit.riverNumber || '未確認'} / 管理番号：${hit.managerNumber || '未確認'}`,
        `河川管理者：${hit.manager || '未確認'}`,
        `浸水深区分：${hit.depth || '未確認'}（公式ランク：${hit.depthRank ?? '未確認'}）`);
      if (hit.boundary) lines.push('Polygon境界上です。敷地の内外を確定せず原典で確認してください。');
    });
    if (result.status === 'NO_DATA') lines.push('この地点について、今回照会した洪水浸水想定区域の該当Polygonは確認されませんでした。区域外であることは、浸水しないことを意味しません。');
    if (result.status === 'UNAVAILABLE') lines.push('洪水Vector Evidenceを取得・検証できませんでした。NO_DATAや区域外とは判定していません。');
    if (result.invalidCount) lines.push('不正なFeatureを含むため、照会結果の完全性は確認できません。');
    lines.push(`データ基準年度：${REFERENCE.year}年度（API一覧の表記）`, REFERENCE.basis,
      'Polygonが分割提供される場合があります。複数Featureを統合していません。',
      '支川・内水・想定を超える降雨等を含む全ての浸水を示す資料ではありません。原典・自治体資料を確認してください。');
    const overview = [];
    if (result.hits.length) {
      overview.push(`この地点で${result.hits.length}件の浸水想定区域が確認されました。`);
      const names = result.hits.map((hit) => hit.riverName).filter(Boolean);
      if (new Set(names).size < names.length) overview.push('同じ河川名のFeatureを含みます。各件を個別に表示しています。');
      result.hits.forEach((hit) => overview.push(hit.riverName || '河川名：未確認', hit.depth || '浸水深区分：未確認'));
    }
    if (result.status === 'NO_DATA' || result.status === 'UNAVAILABLE') {
      overview.push(...lines.filter((line) => line.startsWith('この地点について、') || line.startsWith('洪水Vector Evidenceを')));
    }
    if (result.status === 'PARTIAL') overview.push('一部の属性・境界・資料の完全性は未確認です。詳細と注意事項を確認してください。');
    const details = result.hits.flatMap((hit, index) => [
      `該当Feature ${index + 1} · 河川：${hit.riverName || '未確認'}`,
      `河川管理者：${hit.manager || '未確認'}`,
    ]);
    return { title: '洪水浸水想定｜想定最大規模', status: result.status, lines,
      floodDisplay: { overview, details, evidence: lines },
      links: [
        { url: SOURCE_URL, label: '国土交通省 国土数値情報 / 不動産情報ライブラリ XKT026' },
        { url: REFERENCE.url, label: 'データ年度の根拠：公開API一覧' },
        { url: 'https://nlftp.mlit.go.jp/ksj/gml/codelist/water_depth_code.xlsx', label: '公式浸水深ランクコード' },
      ] };
  }
  const api = Object.freeze({ DEPTHS, REFERENCE, SOURCE_URL, tileFor, geometryRelation, normalizeProperties, identify, toGroup });
  root.FloodIdentifyDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
